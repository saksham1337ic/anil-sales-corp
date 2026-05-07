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
        assert order["invoice_no"].startswith("ASC-") and len(order["invoice_no"]) == len("ASC-YYYYMMDDHHMMSS")
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
