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

