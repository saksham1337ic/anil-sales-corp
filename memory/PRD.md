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
- ✅ Dashboard: live KPIs (today / total revenue, low stock, pending), 14-day Recharts area trend, low-stock alerts panel
- ✅ Point of Sale: product grid + category pills + search, sticky cart, walk-in or saved customer, % / ₹ discount, 5 payment methods (Cash / UPI / Bank / Cheque / Credit), real-time stock validation, ASC-YYYYMMDDHHMMSS invoice on checkout
- ✅ Invoice PDF: branded reportlab A4 (header, items, totals, status), modal preview + Print + Download
- ✅ Products: CRUD, search/filter by category, inline low-stock badges, stock-adjust drawer (receipt / return / damage / adjustment)
- ✅ Customers: CRUD, credit limit & outstanding balance, drawer with order history
- ✅ Orders: list, status filter (pending / dispatched / completed / cancelled), status transitions, payment recording, invoice view
- ✅ Analytics (admin-only): revenue trend, top products, payment-method donut, category bars, employee leaderboard. 7/30/90-day toggle.
- ✅ Backend regression suite (18 tests) and frontend e2e flows verified by testing agent

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
