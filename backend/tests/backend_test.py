"""End-to-end backend tests for Anil Sales Corporation API."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://plumb-stock-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@anilsales.com"
ADMIN_PASS = "Admin@123"
STAFF_EMAIL = "staff@anilsales.com"
STAFF_PASS = "Staff@123"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def staff_token():
    r = requests.post(f"{API}/auth/login", json={"email": STAFF_EMAIL, "password": STAFF_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip("staff seed missing")
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def staff_headers(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == ADMIN_EMAIL and d["user"]["role"] == "admin"
        assert isinstance(d["token"], str) and len(d["token"]) > 20

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"})
        assert r.status_code == 401

    def test_me(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Products ----------------
class TestProducts:
    def test_list_products_seeded(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 12, f"expected >=12 seed products, got {len(rows)}"

    def test_search(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers, params={"q": "Jaquar"})
        assert r.status_code == 200
        assert any("Jaquar" in p["name"] for p in r.json())

    def test_category_filter(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers, params={"category": "Faucets"})
        assert r.status_code == 200
        for p in r.json():
            assert p["category"] == "Faucets"

    def test_create_update_adjust(self, admin_headers):
        sku = f"TEST-{int(time.time())}"
        body = {"name": "TEST_Widget", "sku": sku, "category": "Tools",
                "selling_price": 100, "cost_price": 50, "stock": 5, "tax_rate": 18}
        r = requests.post(f"{API}/products", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        # update
        r2 = requests.patch(f"{API}/products/{pid}", json={"selling_price": 120}, headers=admin_headers)
        assert r2.status_code == 200 and r2.json()["selling_price"] == 120

        # positive stock adj
        r3 = requests.post(f"{API}/products/adjust-stock", headers=admin_headers,
                           json={"product_id": pid, "quantity": 10, "reason": "receipt"})
        assert r3.status_code == 200 and r3.json()["stock"] == 15

        # negative stock adj (damage)
        r4 = requests.post(f"{API}/products/adjust-stock", headers=admin_headers,
                           json={"product_id": pid, "quantity": -3, "reason": "damage"})
        assert r4.status_code == 200 and r4.json()["stock"] == 12

        # cleanup
        requests.delete(f"{API}/products/{pid}", headers=admin_headers)


# ---------------- Categories ----------------
class TestCategories:
    def test_idempotent_create(self, admin_headers):
        body = {"name": "Faucets"}  # already seeded
        r = requests.post(f"{API}/categories", json=body, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "Faucets"


# ---------------- Customers ----------------
class TestCustomers:
    def test_list_seeded(self, admin_headers):
        r = requests.get(f"{API}/customers", headers=admin_headers)
        assert r.status_code == 200 and len(r.json()) >= 3

    def test_create(self, admin_headers):
        r = requests.post(f"{API}/customers", headers=admin_headers,
                          json={"name": "TEST_Cust", "phone": "9999999999", "credit_limit": 5000})
        assert r.status_code == 200
        cid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/customers/{cid}", headers=admin_headers)


# ---------------- POS Checkout ----------------
class TestCheckout:
    def test_checkout_cash_full_flow(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        items_to_buy = prods[:2]
        # remember stock before
        stocks_before = {p["id"]: p["stock"] for p in items_to_buy}

        body = {
            "items": [
                {"product_id": p["id"], "quantity": 1, "price": p["selling_price"], "discount": 0}
                for p in items_to_buy
            ],
            "discount_type": "percent",
            "discount_value": 10,
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["invoice_no"].startswith("ASC-") and len(order["invoice_no"]) == len("ASC-YYYYMMDDHHMMSSXXXX")
        assert order["status"] == "completed"
        assert order["due_amount"] == 0

        # verify stock decremented
        for p in items_to_buy:
            r2 = requests.get(f"{API}/products", headers=admin_headers, params={"q": p["sku"]})
            updated = [x for x in r2.json() if x["id"] == p["id"]][0]
            assert updated["stock"] == stocks_before[p["id"]] - 1

        # PDF endpoint
        token = admin_headers["Authorization"].split()[1]
        rpdf = requests.get(f"{API}/orders/{order['id']}/invoice.pdf?token={token}")
        assert rpdf.status_code == 200
        assert rpdf.headers.get("content-type", "").startswith("application/pdf")
        assert rpdf.content[:4] == b"%PDF"

    def test_checkout_credit_increases_balance(self, admin_headers):
        time.sleep(1.1)  # avoid invoice_no second-precision collision
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        custs = requests.get(f"{API}/customers", headers=admin_headers).json()
        cust = custs[0]
        bal_before = cust.get("current_balance", 0)
        p = prods[0]
        body = {
            "customer_id": cust["id"],
            "items": [{"product_id": p["id"], "quantity": 1, "price": p["selling_price"], "discount": 0}],
            "payment_method": "credit",
            "paid_amount": 0,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["status"] == "pending"
        assert order["due_amount"] > 0

        # customer balance should have increased
        cust_after = [c for c in requests.get(f"{API}/customers", headers=admin_headers).json() if c["id"] == cust["id"]][0]
        assert cust_after["current_balance"] == bal_before + order["due_amount"]

        # status transitions: pending -> dispatched -> completed (via record_payment for completed)
        r2 = requests.patch(f"{API}/orders/{order['id']}/status",
                            json={"status": "dispatched"}, headers=admin_headers)
        assert r2.status_code == 200 and r2.json()["status"] == "dispatched"

        # full payment
        r3 = requests.post(f"{API}/orders/{order['id']}/payment",
                           json={"amount": order["due_amount"], "method": "cash"},
                           headers=admin_headers)
        assert r3.status_code == 200
        assert r3.json()["due_amount"] == 0 and r3.json()["status"] == "completed"

        # customer balance decremented back
        cust_final = [c for c in requests.get(f"{API}/customers", headers=admin_headers).json() if c["id"] == cust["id"]][0]
        assert round(cust_final["current_balance"], 2) == round(bal_before, 2)

    def test_insufficient_stock(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = prods[0]
        body = {
            "items": [{"product_id": p["id"], "quantity": p["stock"] + 1000,
                       "price": p["selling_price"], "discount": 0}],
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 400
        assert "Insufficient" in r.text or "stock" in r.text.lower()


# ---------------- Orders list ----------------
class TestOrders:
    def test_list_and_filter(self, admin_headers):
        r = requests.get(f"{API}/orders", headers=admin_headers)
        assert r.status_code == 200 and len(r.json()) > 0
        # invoice search - use first invoice
        first = r.json()[0]
        r2 = requests.get(f"{API}/orders", headers=admin_headers, params={"q": first["invoice_no"][:10]})
        assert r2.status_code == 200 and len(r2.json()) >= 1
        # status filter
        r3 = requests.get(f"{API}/orders", headers=admin_headers, params={"status_": "pending"})
        assert r3.status_code == 200
        for o in r3.json():
            assert o["status"] == "pending"


# ---------------- Dashboard / Analytics ----------------
class TestDashboard:
    def test_summary(self, admin_headers):
        r = requests.get(f"{API}/dashboard/summary", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("today_revenue", "total_revenue", "pending_orders", "low_stock_items", "sales_trend"):
            assert k in d
        assert len(d["sales_trend"]) == 14

    def test_analytics_admin(self, admin_headers):
        r = requests.get(f"{API}/analytics/overview?days=30", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("revenue_trend", "payment_breakdown", "top_products",
                  "category_breakdown", "employee_performance"):
            assert k in d

    def test_analytics_forbidden_for_staff(self, staff_headers):
        r = requests.get(f"{API}/analytics/overview", headers=staff_headers)
        assert r.status_code == 403


# ---------------- Tasks (Iteration 2) ----------------
class TestTasks:
    def test_create_default_assigned_to_creator(self, admin_headers):
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        body = {"title": "TEST_task default", "priority": "high", "due_date": today}
        r = requests.post(f"{API}/tasks", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        # admin user should be assignee
        me = requests.get(f"{API}/auth/me", headers=admin_headers).json()
        assert t["assigned_to"] == me["id"]
        assert t["status"] == "pending"
        assert t["completed_at"] is None
        # cleanup
        requests.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)

    def test_admin_assigns_to_staff(self, admin_headers):
        users = requests.get(f"{API}/users", headers=admin_headers).json()
        staff = next((u for u in users if u["email"] == STAFF_EMAIL), None)
        if not staff:
            pytest.skip("staff user missing")
        body = {"title": "TEST_assigned", "assigned_to": staff["id"]}
        r = requests.post(f"{API}/tasks", json=body, headers=admin_headers)
        assert r.status_code == 200
        t = r.json()
        assert t["assigned_to"] == staff["id"]
        assert t["assigned_to_name"] == staff["name"]
        requests.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)

    def test_list_scopes_and_status_filter(self, admin_headers):
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # create a task for today
        cr = requests.post(f"{API}/tasks", json={"title": "TEST_today", "due_date": today}, headers=admin_headers)
        tid = cr.json()["id"]
        # default = today
        r = requests.get(f"{API}/tasks", headers=admin_headers)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json())
        # mine
        r2 = requests.get(f"{API}/tasks?scope=mine", headers=admin_headers)
        assert r2.status_code == 200
        assert any(t["id"] == tid for t in r2.json())
        # all
        r3 = requests.get(f"{API}/tasks?scope=all", headers=admin_headers)
        assert r3.status_code == 200
        # status filter pending
        r4 = requests.get(f"{API}/tasks?scope=all&status_=pending", headers=admin_headers)
        assert all(t["status"] == "pending" for t in r4.json())
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)

    def test_patch_status_sets_completed_at(self, admin_headers):
        cr = requests.post(f"{API}/tasks", json={"title": "TEST_complete"}, headers=admin_headers)
        tid = cr.json()["id"]
        r = requests.patch(f"{API}/tasks/{tid}", json={"status": "done"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "done"
        assert r.json()["completed_at"] is not None
        # back to pending clears completed_at
        r2 = requests.patch(f"{API}/tasks/{tid}", json={"status": "pending"}, headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["completed_at"] is None
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)

    def test_delete_permission(self, admin_headers, staff_headers):
        # admin creates task
        cr = requests.post(f"{API}/tasks", json={"title": "TEST_perm"}, headers=admin_headers)
        tid = cr.json()["id"]
        # staff cannot delete (not creator, not admin)
        r = requests.delete(f"{API}/tasks/{tid}", headers=staff_headers)
        assert r.status_code == 403
        # admin can delete
        r2 = requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)
        assert r2.status_code == 200


# ---------------- Cancel Order (Iteration 2) ----------------
class TestCancelOrder:
    def test_cancel_restocks_and_excludes_revenue(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 2)
        stock_before = p["stock"]
        body = {
            "items": [{"product_id": p["id"], "quantity": 2, "price": p["selling_price"], "discount": 0}],
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        order = r.json()
        oid = order["id"]
        order_total = order["total"]

        # before cancel: revenue includes order
        rev_before = requests.get(f"{API}/dashboard/summary", headers=admin_headers).json()["total_revenue"]

        # cancel
        rc = requests.post(f"{API}/orders/{oid}/cancel", json={"reason": "customer changed mind"}, headers=admin_headers)
        assert rc.status_code == 200, rc.text
        co = rc.json()
        assert co["status"] == "cancelled"
        assert co["cancelled_at"] is not None
        assert co["cancel_reason"] == "customer changed mind"

        # second cancel returns 400
        rc2 = requests.post(f"{API}/orders/{oid}/cancel", json={"reason": "x"}, headers=admin_headers)
        assert rc2.status_code == 400

        # stock restored
        p_after = [x for x in requests.get(f"{API}/products", headers=admin_headers).json() if x["id"] == p["id"]][0]
        assert p_after["stock"] == stock_before, f"expected stock {stock_before}, got {p_after['stock']}"

        # cancellation movement logged
        movs = requests.get(f"{API}/stock-movements?limit=20", headers=admin_headers).json()
        assert any(m["type"] == "cancellation" and m["product_id"] == p["id"] for m in movs)

        # revenue excludes cancelled
        rev_after = requests.get(f"{API}/dashboard/summary", headers=admin_headers).json()["total_revenue"]
        assert round(rev_after, 2) == round(rev_before - order_total, 2)

        # analytics excludes cancelled
        an = requests.get(f"{API}/analytics/overview?days=30", headers=admin_headers).json()
        assert all(o for o in an["revenue_trend"])  # smoke
        # the cancelled order's payment shouldn't appear in breakdown total revenue
        assert an["total_revenue"] >= 0

    def test_cancel_credit_reverses_customer_balance(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        custs = requests.get(f"{API}/customers", headers=admin_headers).json()
        cust = custs[0]
        bal_before = cust["current_balance"]
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "customer_id": cust["id"],
            "items": [{"product_id": p["id"], "quantity": 1, "price": p["selling_price"], "discount": 0}],
            "payment_method": "credit", "paid_amount": 0,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        order = r.json()
        # cancel
        rc = requests.post(f"{API}/orders/{order['id']}/cancel", json={"reason": "test"}, headers=admin_headers)
        assert rc.status_code == 200
        # balance reverted
        cust_after = [c for c in requests.get(f"{API}/customers", headers=admin_headers).json() if c["id"] == cust["id"]][0]
        assert round(cust_after["current_balance"], 2) == round(bal_before, 2)


# ---------------- Delivery Checkout (Iteration 2) ----------------
class TestDeliveryCheckout:
    def test_checkout_with_delivery(self, admin_headers):
        time.sleep(1.1)  # avoid invoice_no second-precision collision
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 1000, "discount": 0}],
            "payment_method": "cash",
            "is_delivery": True,
            "delivery_address": "Test Address, Mumbai 400001",
            "delivery_charges": 150,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        order = r.json()
        assert order["is_delivery"] is True
        assert order["delivery_address"] == "Test Address, Mumbai 400001"
        assert order["delivery_charges"] == 150
        # subtotal=1000, tax=18% => 180, +delivery 150 => 1330
        assert order["total"] == round(1000 + (1000 * p["tax_rate"] / 100.0) + 150, 2)

        # PDF reachable
        token = admin_headers["Authorization"].split()[1]
        rpdf = requests.get(f"{API}/orders/{order['id']}/invoice.pdf?token={token}")
        assert rpdf.status_code == 200
        assert rpdf.headers.get("content-type", "").startswith("application/pdf")
        assert rpdf.content[:4] == b"%PDF"

    def test_checkout_no_delivery_defaults(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 500, "discount": 0}],
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        o = r.json()
        assert o["is_delivery"] is False
        assert o["delivery_charges"] == 0
        assert o["delivery_address"] == ""
        # total = 500 + tax (no delivery)
        assert o["total"] == round(500 + (500 * p["tax_rate"] / 100.0), 2)


# ---------------- Iteration 3: Labour Charges ----------------
class TestLabourCharges:
    def test_checkout_with_labour(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 1000, "discount": 0}],
            "payment_method": "cash",
            "is_labour": True,
            "labour_description": "Plumbing fitting",
            "labour_charges": 300,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["is_labour"] is True
        assert order["labour_description"] == "Plumbing fitting"
        assert order["labour_charges"] == 300
        # subtotal=1000, tax=tax_rate%, +labour 300
        expected = round(1000 + (1000 * p["tax_rate"] / 100.0) + 300, 2)
        assert order["total"] == expected
        # not delivery -> still completed
        assert order["status"] == "completed"

    def test_checkout_with_delivery_and_labour(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 1000, "discount": 0}],
            "payment_method": "cash",
            "is_delivery": True, "delivery_address": "Addr A", "delivery_charges": 100,
            "is_labour": True, "labour_description": "Install", "labour_charges": 250,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        o = r.json()
        assert o["is_delivery"] and o["is_labour"]
        assert o["delivery_charges"] == 100 and o["labour_charges"] == 250
        # PDF check + new company info bytes
        token = admin_headers["Authorization"].split()[1]
        rpdf = requests.get(f"{API}/orders/{o['id']}/invoice.pdf?token={token}")
        assert rpdf.status_code == 200 and rpdf.content[:4] == b"%PDF"
        # Extract text via pypdf (reportlab compresses streams)
        from pypdf import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(rpdf.content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        assert "AADFA7788E" in text, f"PAN/GSTIN substring missing in invoice PDF text"
        assert "Jalandhar" in text, "address city missing in invoice PDF text"
        assert "UDYAM-PB-10-0020522" in text
        assert "vivek.anilsales@gmail.com" in text
        assert "7696057000" in text and "0181 2282465" in text


# ---------------- Iteration 3: Delivery default-pending ----------------
class TestDeliveryPendingDefault:
    def test_delivery_cash_is_pending(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 500, "discount": 0}],
            "payment_method": "cash",
            "is_delivery": True, "delivery_address": "X", "delivery_charges": 50,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_delivery_upi_is_pending(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 500, "discount": 0}],
            "payment_method": "upi",
            "is_delivery": True, "delivery_address": "X", "delivery_charges": 0,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_no_delivery_cash_is_completed(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "items": [{"product_id": p["id"], "quantity": 1, "price": 200, "discount": 0}],
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    def test_credit_no_delivery_is_pending(self, admin_headers):
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        custs = requests.get(f"{API}/customers", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        body = {
            "customer_id": custs[0]["id"],
            "items": [{"product_id": p["id"], "quantity": 1, "price": 300, "discount": 0}],
            "payment_method": "credit", "paid_amount": 0,
        }
        r = requests.post(f"{API}/pos/checkout", json=body, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"


# ---------------- Iteration 3: Audit Logs ----------------
class TestAuditLogs:
    def test_admin_can_list(self, admin_headers):
        # Trigger a fresh login event
        requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        r = requests.get(f"{API}/audit-logs?days=1&limit=200", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        actions = {row["action"] for row in rows}
        assert "auth.login" in actions

    def test_staff_forbidden(self, staff_headers):
        r = requests.get(f"{API}/audit-logs", headers=staff_headers)
        assert r.status_code == 403

    def test_stats(self, admin_headers):
        r = requests.get(f"{API}/audit-logs/stats?days=1", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "by_action" in d
        assert isinstance(d["by_action"], list)
        assert d["total"] >= 0

    def test_filters(self, admin_headers):
        # entity_type filter
        r = requests.get(f"{API}/audit-logs?entity_type=order&days=7&limit=100", headers=admin_headers)
        assert r.status_code == 200
        for row in r.json():
            assert row["entity_type"] == "order"
        # q filter
        r2 = requests.get(f"{API}/audit-logs?q=ASC-&days=7&limit=50", headers=admin_headers)
        assert r2.status_code == 200

    def test_product_create_logged(self, admin_headers):
        sku = f"TESTLOG-{int(time.time())}"
        body = {"name": "TEST_LogProd", "sku": sku, "category": "Tools",
                "selling_price": 50, "cost_price": 30, "stock": 5}
        rc = requests.post(f"{API}/products", json=body, headers=admin_headers)
        assert rc.status_code == 200
        pid = rc.json()["id"]
        # update
        requests.patch(f"{API}/products/{pid}", json={"selling_price": 60}, headers=admin_headers)
        # delete
        requests.delete(f"{API}/products/{pid}", headers=admin_headers)
        # check logs include create+update+delete for this entity
        time.sleep(0.5)
        r = requests.get(f"{API}/audit-logs?entity_type=product&days=1&limit=500", headers=admin_headers)
        logs = r.json()
        actions_for_pid = {log["action"] for log in logs if log["entity_id"] == pid}
        assert {"product.create", "product.update", "product.delete"}.issubset(actions_for_pid)

    def test_order_and_task_logs(self, admin_headers):
        # task create + toggle
        cr = requests.post(f"{API}/tasks", json={"title": "TEST_log_task"}, headers=admin_headers)
        tid = cr.json()["id"]
        requests.patch(f"{API}/tasks/{tid}", json={"status": "done"}, headers=admin_headers)
        time.sleep(0.5)
        r = requests.get(f"{API}/audit-logs?entity_type=task&days=1&limit=500", headers=admin_headers)
        logs = r.json()
        a = {log["action"] for log in logs if log["entity_id"] == tid}
        assert "task.create" in a and "task.toggle" in a
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)

        # order create + cancel
        time.sleep(1.1)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["stock"] >= 1)
        co = requests.post(f"{API}/pos/checkout", json={
            "items": [{"product_id": p["id"], "quantity": 1, "price": 100, "discount": 0}],
            "payment_method": "cash",
        }, headers=admin_headers)
        oid = co.json()["id"]
        requests.post(f"{API}/orders/{oid}/cancel", json={"reason": "test"}, headers=admin_headers)
        time.sleep(0.5)
        r2 = requests.get(f"{API}/audit-logs?entity_type=order&days=1&limit=500", headers=admin_headers)
        a2 = {log["action"] for log in r2.json() if log["entity_id"] == oid}
        assert "order.create" in a2 and "order.cancel" in a2



# ---------------- Iteration 4: date filters, CSV export, customer payment ----------------
import datetime as _dt


def _today_str():
    return _dt.date.today().strftime("%Y-%m-%d")


class TestOrdersDateFilter:
    def test_today_filter_returns_recent(self, admin_headers):
        # create a fresh order so today bucket has at least one
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = prods[0]
        requests.post(f"{API}/pos/checkout", json={
            "items": [{"product_id": p["id"], "quantity": 1, "price": p["selling_price"], "discount": 0}],
            "payment_method": "cash",
        }, headers=admin_headers)
        td = _today_str()
        r = requests.get(f"{API}/orders?from_date={td}&to_date={td}&limit=500", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        for o in rows:
            assert o["created_at"][:10] == td, f"order outside date range: {o['created_at']}"

    def test_far_past_returns_empty(self, admin_headers):
        r = requests.get(f"{API}/orders?from_date=2000-01-01&to_date=2000-01-02", headers=admin_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_status_and_q_combined_with_dates(self, admin_headers):
        td = _today_str()
        r = requests.get(f"{API}/orders?status_=completed&from_date={td}&to_date={td}", headers=admin_headers)
        assert r.status_code == 200
        for o in r.json():
            assert o["status"] == "completed"
            assert o["created_at"][:10] == td


class TestOrdersCsvExport:
    EXPECTED_HEADER = "Invoice,Date,Customer,Phone,Items,Subtotal,Discount,Tax,Delivery,Labour,Total,Paid,Due,Payment,Status,Delivery?,Address,Cashier,Notes"

    def test_export_no_token_401(self):
        r = requests.get(f"{API}/orders/export.csv")
        assert r.status_code == 401

    def test_export_with_query_token(self, admin_token):
        r = requests.get(f"{API}/orders/export.csv?token={admin_token}", timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct, f"unexpected content-type: {ct}"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), f"missing attachment: {cd}"
        assert "filename=" in cd.lower() and "sales_" in cd.lower(), f"filename missing/wrong: {cd}"
        first_line = r.text.lstrip("\ufeff").splitlines()[0]
        assert first_line.startswith(self.EXPECTED_HEADER), f"header mismatch: {first_line!r}"

    def test_export_with_bearer_header(self, admin_headers):
        r = requests.get(f"{API}/orders/export.csv", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_export_with_date_filter(self, admin_token):
        # ensure there's at least one order today
        admin_h = {"Authorization": f"Bearer {admin_token}"}
        prods = requests.get(f"{API}/products", headers=admin_h).json()
        p = prods[0]
        co = requests.post(f"{API}/pos/checkout", json={
            "items": [{"product_id": p["id"], "quantity": 1, "price": p["selling_price"], "discount": 0}],
            "payment_method": "cash",
        }, headers=admin_h)
        assert co.status_code == 200
        inv_today = co.json()["invoice_no"]

        td = _today_str()
        r_today = requests.get(f"{API}/orders/export.csv?token={admin_token}&from_date={td}&to_date={td}", timeout=20)
        assert r_today.status_code == 200
        text_today = r_today.text
        assert inv_today in text_today, "today's invoice missing from today's CSV"

        # past range should not contain the new invoice
        r_past = requests.get(f"{API}/orders/export.csv?token={admin_token}&from_date=2000-01-01&to_date=2000-01-02", timeout=20)
        assert r_past.status_code == 200
        assert inv_today not in r_past.text
        # only header line in body (1 line)
        body = r_past.text.lstrip("\ufeff")
        assert len(body.strip().splitlines()) == 1

    def test_export_invalid_token_401(self):
        r = requests.get(f"{API}/orders/export.csv?token=garbage.token.value")
        assert r.status_code == 401


class TestCustomerPayment:
    @pytest.fixture
    def cust_with_two_credit_orders(self, admin_headers):
        # fresh customer
        rc = requests.post(f"{API}/customers", headers=admin_headers,
                           json={"name": f"TEST_PayCust_{int(time.time())}", "phone": "9000099000", "credit_limit": 50000})
        assert rc.status_code == 200
        cust = rc.json()
        cid = cust["id"]
        # pick a stocked product
        prods = [p for p in requests.get(f"{API}/products", headers=admin_headers).json() if p.get("stock", 0) >= 5]
        p = prods[0]
        # Order A - oldest, credit, due 1000
        coA = requests.post(f"{API}/pos/checkout", json={
            "customer_id": cid,
            "items": [{"product_id": p["id"], "quantity": 1, "price": 1000, "discount": 0}],
            "payment_method": "credit",
        }, headers=admin_headers)
        assert coA.status_code == 200, coA.text
        time.sleep(1.1)  # ensure different created_at
        # Order B - later, credit, due 500
        coB = requests.post(f"{API}/pos/checkout", json={
            "customer_id": cid,
            "items": [{"product_id": p["id"], "quantity": 1, "price": 500, "discount": 0}],
            "payment_method": "credit",
        }, headers=admin_headers)
        assert coB.status_code == 200
        yield {"cid": cid, "orderA": coA.json(), "orderB": coB.json()}
        # cleanup: delete customer (orders remain but it's fine)
        requests.delete(f"{API}/customers/{cid}", headers=admin_headers)

    def test_negative_amount_400(self, admin_headers, cust_with_two_credit_orders):
        cid = cust_with_two_credit_orders["cid"]
        r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                          json={"amount": -10, "method": "cash", "note": ""})
        assert r.status_code == 400

    def test_zero_amount_400(self, admin_headers, cust_with_two_credit_orders):
        cid = cust_with_two_credit_orders["cid"]
        r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                          json={"amount": 0, "method": "cash", "note": ""})
        assert r.status_code == 400

    def test_nonexistent_customer_404(self, admin_headers):
        r = requests.post(f"{API}/customers/does-not-exist/payment", headers=admin_headers,
                          json={"amount": 100, "method": "cash"})
        assert r.status_code == 404

    def test_partial_payment_fifo(self, admin_headers, cust_with_two_credit_orders):
        cid = cust_with_two_credit_orders["cid"]
        oA = cust_with_two_credit_orders["orderA"]
        oB = cust_with_two_credit_orders["orderB"]
        total_due = round(oA["due_amount"] + oB["due_amount"], 2)
        # initial balance must equal sum of dues
        cust0 = next(c for c in requests.get(f"{API}/customers", headers=admin_headers).json() if c["id"] == cid)
        assert round(cust0["current_balance"], 2) == total_due

        # pay an amount strictly less than oA's due → A partially paid, B untouched
        partial = round(oA["due_amount"] - 100, 2)
        assert partial > 0
        r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                          json={"amount": partial, "method": "cash", "note": "TEST partial"})
        assert r.status_code == 200, r.text
        updated = r.json()
        assert round(updated["current_balance"], 2) == round(total_due - partial, 2)

        # fetch orders and check FIFO
        ordsA = requests.get(f"{API}/orders/{oA['id']}", headers=admin_headers).json()
        ordsB = requests.get(f"{API}/orders/{oB['id']}", headers=admin_headers).json()
        assert round(ordsA["due_amount"], 2) == round(oA["due_amount"] - partial, 2)
        assert round(ordsA["paid_amount"], 2) == partial
        assert round(ordsB["due_amount"], 2) == round(oB["due_amount"], 2)  # untouched
        assert round(ordsB["paid_amount"], 2) == 0.00

    def test_full_payment_completes_non_delivery(self, admin_headers, cust_with_two_credit_orders):
        cid = cust_with_two_credit_orders["cid"]
        oA = cust_with_two_credit_orders["orderA"]
        oB = cust_with_two_credit_orders["orderB"]
        total_due = round(oA["due_amount"] + oB["due_amount"], 2)
        # pay in full
        r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                          json={"amount": total_due, "method": "upi", "note": "TEST full"})
        assert r.status_code == 200, r.text
        updated = r.json()
        assert round(updated["current_balance"], 2) == 0.00

        ordsA = requests.get(f"{API}/orders/{oA['id']}", headers=admin_headers).json()
        ordsB = requests.get(f"{API}/orders/{oB['id']}", headers=admin_headers).json()
        assert round(ordsA["due_amount"], 2) == 0.00
        assert round(ordsB["due_amount"], 2) == 0.00
        # non-delivery → both auto-completed
        assert ordsA["status"] == "completed"
        assert ordsB["status"] == "completed"

    def test_overpayment_negative_balance(self, admin_headers, cust_with_two_credit_orders):
        cid = cust_with_two_credit_orders["cid"]
        oA = cust_with_two_credit_orders["orderA"]
        oB = cust_with_two_credit_orders["orderB"]
        total_due = round(oA["due_amount"] + oB["due_amount"], 2)
        overpay = total_due + 500
        r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                          json={"amount": overpay, "method": "cash"})
        assert r.status_code == 200
        assert round(r.json()["current_balance"], 2) == -500.00

    def test_audit_log_written(self, admin_headers, cust_with_two_credit_orders):
        cid = cust_with_two_credit_orders["cid"]
        r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                          json={"amount": 200, "method": "cash", "note": "audit-test"})
        assert r.status_code == 200
        time.sleep(0.5)
        logs = requests.get(f"{API}/audit-logs?entity_type=customer&days=1&limit=500",
                            headers=admin_headers).json()
        actions = [log["action"] for log in logs if log["entity_id"] == cid]
        assert "customer.payment" in actions

    def test_payment_keeps_delivery_status(self, admin_headers):
        # Create customer + delivery credit order
        rc = requests.post(f"{API}/customers", headers=admin_headers,
                           json={"name": f"TEST_PayDeliv_{int(time.time())}", "phone": "9111199111", "credit_limit": 50000})
        cust = rc.json()
        cid = cust["id"]
        try:
            prods = [p for p in requests.get(f"{API}/products", headers=admin_headers).json() if p.get("stock", 0) >= 1]
            p = prods[0]
            co = requests.post(f"{API}/pos/checkout", json={
                "customer_id": cid,
                "items": [{"product_id": p["id"], "quantity": 1, "price": 800, "discount": 0}],
                "payment_method": "credit",
                "is_delivery": True,
                "delivery_address": "TEST 123 lane",
            }, headers=admin_headers)
            assert co.status_code == 200, co.text
            order = co.json()
            assert order["is_delivery"] is True
            initial_status = order["status"]  # likely "pending"
            order_due = round(order["due_amount"], 2)

            r = requests.post(f"{API}/customers/{cid}/payment", headers=admin_headers,
                              json={"amount": order_due, "method": "cash"})
            assert r.status_code == 200
            o2 = requests.get(f"{API}/orders/{order['id']}", headers=admin_headers).json()
            assert round(o2["due_amount"], 2) == 0.00
            # delivery status preserved (NOT auto-completed)
            assert o2["status"] == initial_status, f"delivery status was changed: {initial_status}->{o2['status']}"
            assert o2["status"] != "completed"
        finally:
            requests.delete(f"{API}/customers/{cid}", headers=admin_headers)
