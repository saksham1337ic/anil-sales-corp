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
- ✅ Backend regression: 27/27 pytest passing (existing 18 + 9 new).

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
