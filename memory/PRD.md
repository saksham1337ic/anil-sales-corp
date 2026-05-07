# Anil Sales Corporation – Inventory & POS

## Original Problem Statement
Build a complete, production-ready, modern inventory management system for **Anil Sales Corporation** — a sanitary and plumbing products retailer. Full-stack web app, premium SaaS-style UI with dark/light mode, built on FastAPI + React + MongoDB. Auth, Dashboard, POS, Products, Customers, Orders/Invoices (PDF), Analytics. Indian rupee, GST aware. Invoice format `ASC-YYYYMMDDHHMMSS`.

## User personas
- **Admin (Anil)** — full access incl. analytics, user management, deletes.
- **Employee / Cashier** — POS, products (CRUD non-delete), customers, orders.

## Architecture
- Backend: **FastAPI** (`/api` prefix), **MongoDB (motor)**, JWT bearer auth (14-day expiry, header + `?token=` for PDF), bcrypt passwords, **reportlab** PDF.
- Frontend: **React (CRA)**, react-router, **shadcn/ui**, **Tailwind**, Recharts, sonner toasts. Dark theme by default. Outfit + Manrope fonts.
- Single-DB seed on startup: admin user, demo employee, 8 categories, 12 products, 3 customers.

## What's been implemented (2026-02-09)
- ✅ JWT auth (login, me, logout) + role-based gating (`admin`/`employee`)
- ✅ Premium dark UI: glass sidebar, sticky topbar, KPI bento, Outfit/Manrope fonts, emerald + cobalt accents
- ✅ Dashboard, POS, Products, Customers, Orders, Invoice PDF, Analytics (admin-only)

## Iteration 2 (2026-02-09)
- ✅ **Tasks for today**: new `/tasks` page + collection. Admin & staff add tasks (title, description, priority, due date), tick to complete. Admin can assign to any user. Stats cards (open / done / overdue). Scopes: Today / My tasks / All. Sidebar nav added.
- ✅ **Cancel order**: new POST `/api/orders/{id}/cancel` with reason. Restocks every line item (logs `cancellation` movements), reverses customer credit balance, sets status=cancelled. Cancelled orders are excluded from dashboard revenue and analytics. UI: Cancel button on each non-cancelled row in Orders, with confirm dialog showing impact.
- ✅ **Delivery orders**: checkbox in POS cart → reveals address textarea + delivery charges input. Charges added to total. Order persists `is_delivery`, `delivery_address`, `delivery_charges`. Invoice modal & reportlab PDF render a dedicated DELIVERY ADDRESS section + delivery charges line in totals + a "Delivery Order" badge. Truck icon in Orders list for delivery rows.
- ✅ **Invoice number race fix**: `make_invoice_no()` now appends a 4-char random suffix → safe against same-second collisions on rapid checkouts.

## Iteration 3 (2026-02-09)
- ✅ **Labour charges in POS**: checkbox + optional description + amount; flows into order total and renders as a "Labour" line in the InvoiceModal & PDF.
- ✅ **Delivery orders default to `pending`**: pipeline is now Pending → Dispatched → Completed regardless of payment method (cash/UPI/etc.). Existing Dispatch / Complete buttons drive the flow.
- ✅ **Audit Logs**: new `audit_logs` collection + `log_event()` helper. Hooks on `auth.login`/`logout`/`login_failed`, `product.create/update/delete/adjust_stock`, `customer.create/update/delete`, `order.create/status_change/payment/cancel`, `task.create/toggle/update/delete`. New admin-only `/logs` page with stat cards, day-grouped timeline, entity filter, search, day range tabs (1/7/30/90).
- ✅ **Real company info on invoices**: GSTIN `03AADFA7788E1ZI`, PAN `AADFA7788E`, `UDYAM-PB-10-0020522`, address "9 - Cannaught Circus, Hind Samachar Ground, Jalandhar - 144001", office `0181 2282465`, mobiles `7696057000`/`7696028000`, email `vivek.anilsales@gmail.com` — both modal and reportlab PDF.
- ✅ **Tested**: 39/39 backend pytest passing; frontend POS labour, /logs admin, sidebar RBAC all verified.

## Test credentials
- Admin: `admin@anilsales.com` / `Admin@123`
- Employee: `staff@anilsales.com` / `Staff@123`

## Backlog (P1 / P2)
- [P1] Supplier management (basic) and Purchase orders
- [P1] Expense tracking module
- [P1] Stock reconciliation / physical count
- [P1] Activity audit log UI (data already captured in `stock_movements`)
- [P2] Batch/expiry tracking on products
- [P2] CSV import for products / customers
- [P2] WhatsApp invoice share, e-mail receipts
- [P2] Multi-store / location

## Next tasks
1. (Optional) Add `DialogDescription` props on remaining dialogs to silence Radix a11y warning.
2. (Optional) Add `minHeight` to Recharts ResponsiveContainer to remove first-paint width(-1) warnings.
3. Build out P1 modules above on user request.
