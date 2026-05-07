"""Anil Sales Corporation - Inventory & POS Backend (FastAPI + MongoDB)."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)


# ---------------------------------------------------------------------------
# Config / DB
# ---------------------------------------------------------------------------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = "HS256"
TOKEN_DAYS = 14

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Anil Sales Corporation API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("asc")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: Literal["admin", "employee"]
    created_at: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: Literal["admin", "employee"] = "employee"


class CategoryCreate(BaseModel):
    name: str


class CategoryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    created_at: str


class ProductBase(BaseModel):
    name: str
    sku: str
    category: str = "General"
    unit: str = "pcs"
    hsn: Optional[str] = ""
    cost_price: float = 0.0
    selling_price: float = 0.0
    tax_rate: float = 0.0
    stock: float = 0.0
    low_stock_threshold: float = 10.0
    description: Optional[str] = ""
    image_url: Optional[str] = ""


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    hsn: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    tax_rate: Optional[float] = None
    low_stock_threshold: Optional[float] = None
    description: Optional[str] = None
    image_url: Optional[str] = None


class ProductOut(ProductBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str
    updated_at: str


class StockAdjustIn(BaseModel):
    product_id: str
    quantity: float   # positive = add, negative = remove
    reason: str = "adjustment"  # adjustment | receipt | return | damage
    note: Optional[str] = ""


class CustomerBase(BaseModel):
    name: str
    phone: str = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    gstin: Optional[str] = ""
    credit_limit: float = 0.0


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    credit_limit: Optional[float] = None


class CustomerOut(CustomerBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    current_balance: float = 0.0
    created_at: str


class CartItemIn(BaseModel):
    product_id: str
    quantity: float
    price: float        # unit selling price used at sale time
    discount: float = 0.0  # flat per-line discount amount


class CheckoutIn(BaseModel):
    customer_id: Optional[str] = None  # None = walk-in
    customer_name: Optional[str] = "Walk-in Customer"
    customer_phone: Optional[str] = ""
    items: List[CartItemIn]
    discount_type: Literal["percent", "fixed"] = "fixed"
    discount_value: float = 0.0
    payment_method: Literal["cash", "upi", "bank", "cheque", "credit"] = "cash"
    paid_amount: float = 0.0
    notes: Optional[str] = ""


class OrderItemOut(BaseModel):
    product_id: str
    name: str
    sku: str
    quantity: float
    price: float
    discount: float
    total: float


class OrderOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_no: str
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    items: List[OrderItemOut]
    subtotal: float
    discount_type: str
    discount_value: float
    discount_amount: float
    tax: float
    total: float
    payment_method: str
    paid_amount: float
    due_amount: float
    status: str
    created_by: str
    created_by_name: str
    notes: str
    created_at: str


class OrderStatusUpdate(BaseModel):
    status: Literal["pending", "dispatched", "completed", "cancelled"]


class PaymentRecordIn(BaseModel):
    amount: float
    method: Literal["cash", "upi", "bank", "cheque"] = "cash"
    note: Optional[str] = ""


# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], user["email"], user["role"])
    public = {k: user[k] for k in ("id", "email", "name", "role", "created_at")}
    return {"token": token, "user": public}


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


@api.get("/users", response_model=List[UserPublic])
async def list_users(user: dict = Depends(require_admin)):
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return rows


@api.post("/users", response_model=UserPublic)
async def create_user(body: UserCreate, user: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id(),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return {k: doc[k] for k in ("id", "email", "name", "role", "created_at")}


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
@api.get("/categories", response_model=List[CategoryOut])
async def list_categories(user: dict = Depends(get_current_user)):
    return await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)


@api.post("/categories", response_model=CategoryOut)
async def create_category(body: CategoryCreate, user: dict = Depends(get_current_user)):
    existing = await db.categories.find_one({"name": body.name})
    if existing:
        return {k: existing[k] for k in ("id", "name", "created_at")}
    doc = {"id": new_id(), "name": body.name, "created_at": now_iso()}
    await db.categories.insert_one(doc)
    return {k: doc[k] for k in ("id", "name", "created_at")}


@api.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(require_admin)):
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@api.get("/products", response_model=List[ProductOut])
async def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    filt: dict = {}
    if category and category != "all":
        filt["category"] = category
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.products.find(filt, {"_id": 0}).sort("name", 1).to_list(1000)
    return rows


@api.post("/products", response_model=ProductOut)
async def create_product(body: ProductCreate, user: dict = Depends(get_current_user)):
    if await db.products.find_one({"sku": body.sku}):
        raise HTTPException(status_code=400, detail="SKU already exists")
    now = now_iso()
    doc = {**body.model_dump(), "id": new_id(), "created_at": now, "updated_at": now}
    await db.products.insert_one(doc)
    # ensure category exists
    if body.category:
        await db.categories.update_one(
            {"name": body.category},
            {"$setOnInsert": {"id": new_id(), "name": body.category, "created_at": now}},
            upsert=True,
        )
    doc.pop("_id", None)
    return doc


@api.patch("/products/{pid}", response_model=ProductOut)
async def update_product(pid: str, body: ProductUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No changes")
    updates["updated_at"] = now_iso()
    res = await db.products.find_one_and_update(
        {"id": pid}, {"$set": updates}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Product not found")
    res.pop("_id", None)
    return res


@api.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_admin)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}


@api.post("/products/adjust-stock")
async def adjust_stock(body: StockAdjustIn, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    new_stock = product.get("stock", 0) + body.quantity
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Stock cannot go negative")
    await db.products.update_one(
        {"id": body.product_id},
        {"$set": {"stock": new_stock, "updated_at": now_iso()}},
    )
    await db.stock_movements.insert_one({
        "id": new_id(),
        "product_id": body.product_id,
        "product_name": product["name"],
        "type": body.reason,
        "quantity": body.quantity,
        "note": body.note,
        "user_id": user["id"],
        "user_name": user["name"],
        "created_at": now_iso(),
    })
    return {"ok": True, "stock": new_stock}


@api.get("/stock-movements")
async def list_stock_movements(limit: int = 50, user: dict = Depends(get_current_user)):
    rows = await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
@api.get("/customers", response_model=List[CustomerOut])
async def list_customers(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    filt: dict = {}
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.customers.find(filt, {"_id": 0}).sort("name", 1).to_list(1000)
    return rows


@api.post("/customers", response_model=CustomerOut)
async def create_customer(body: CustomerCreate, user: dict = Depends(get_current_user)):
    doc = {**body.model_dump(), "id": new_id(), "current_balance": 0.0, "created_at": now_iso()}
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/customers/{cid}", response_model=CustomerOut)
async def update_customer(cid: str, body: CustomerUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No changes")
    res = await db.customers.find_one_and_update(
        {"id": cid}, {"$set": updates}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Customer not found")
    res.pop("_id", None)
    return res


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user: dict = Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}


@api.get("/customers/{cid}/orders")
async def customer_orders(cid: str, user: dict = Depends(get_current_user)):
    rows = await db.orders.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ---------------------------------------------------------------------------
# Orders / POS Checkout
# ---------------------------------------------------------------------------
def make_invoice_no() -> str:
    # ASC-YYYYMMDDHHMMSS (UTC)
    return "ASC-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


@api.post("/pos/checkout", response_model=OrderOut)
async def checkout(body: CheckoutIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Fetch products & validate stock
    line_items = []
    subtotal = 0.0
    tax_total = 0.0
    for it in body.items:
        prod = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=400, detail=f"Product not found: {it.product_id}")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid quantity for {prod['name']}")
        if prod.get("stock", 0) < it.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {prod['name']}")
        line_total = it.price * it.quantity - it.discount
        line_tax = line_total * (prod.get("tax_rate", 0) / 100.0)
        subtotal += line_total
        tax_total += line_tax
        line_items.append({
            "product_id": prod["id"],
            "name": prod["name"],
            "sku": prod["sku"],
            "quantity": it.quantity,
            "price": it.price,
            "discount": it.discount,
            "total": round(line_total, 2),
        })

    # Order-level discount
    if body.discount_type == "percent":
        disc_amount = subtotal * (body.discount_value / 100.0)
    else:
        disc_amount = body.discount_value
    disc_amount = max(0.0, min(disc_amount, subtotal))

    total = round(subtotal - disc_amount + tax_total, 2)
    paid = body.paid_amount
    if body.payment_method != "credit":
        # assume full paid unless explicitly set (cash/upi/bank/cheque always settle)
        if paid <= 0:
            paid = total
    due = round(max(0.0, total - paid), 2)

    # Resolve customer
    customer_id = body.customer_id
    customer_name = body.customer_name or "Walk-in Customer"
    customer_phone = body.customer_phone or ""
    if customer_id:
        cust = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not cust:
            raise HTTPException(status_code=400, detail="Customer not found")
        customer_name = cust["name"]
        customer_phone = cust.get("phone", "")

    invoice_no = make_invoice_no()

    order_doc = {
        "id": new_id(),
        "invoice_no": invoice_no,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "items": line_items,
        "subtotal": round(subtotal, 2),
        "discount_type": body.discount_type,
        "discount_value": body.discount_value,
        "discount_amount": round(disc_amount, 2),
        "tax": round(tax_total, 2),
        "total": total,
        "payment_method": body.payment_method,
        "paid_amount": round(paid, 2),
        "due_amount": due,
        "status": "completed" if body.payment_method != "credit" else "pending",
        "created_by": user["id"],
        "created_by_name": user["name"],
        "notes": body.notes or "",
        "created_at": now_iso(),
    }
    await db.orders.insert_one(order_doc)

    # Decrement stock + log movement
    for it in line_items:
        await db.products.update_one(
            {"id": it["product_id"]},
            {"$inc": {"stock": -it["quantity"]}, "$set": {"updated_at": now_iso()}},
        )
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": it["product_id"],
            "product_name": it["name"],
            "type": "sale",
            "quantity": -it["quantity"],
            "note": f"Invoice {invoice_no}",
            "user_id": user["id"],
            "user_name": user["name"],
            "created_at": now_iso(),
        })

    # Update customer balance if credit
    if customer_id and due > 0:
        await db.customers.update_one(
            {"id": customer_id}, {"$inc": {"current_balance": due}}
        )

    order_doc.pop("_id", None)
    return order_doc


@api.get("/orders", response_model=List[OrderOut])
async def list_orders(
    status_: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    user: dict = Depends(get_current_user),
):
    filt: dict = {}
    if status_ and status_ != "all":
        filt["status"] = status_
    if q:
        filt["$or"] = [
            {"invoice_no": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.orders.find(filt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@api.get("/orders/{oid}", response_model=OrderOut)
async def get_order(oid: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return o


@api.patch("/orders/{oid}/status", response_model=OrderOut)
async def update_status(oid: str, body: OrderStatusUpdate, user: dict = Depends(get_current_user)):
    res = await db.orders.find_one_and_update(
        {"id": oid}, {"$set": {"status": body.status}}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Order not found")
    res.pop("_id", None)
    return res


@api.post("/orders/{oid}/payment", response_model=OrderOut)
async def record_payment(oid: str, body: PaymentRecordIn, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    new_paid = round(order.get("paid_amount", 0) + body.amount, 2)
    new_due = round(max(0.0, order["total"] - new_paid), 2)
    await db.orders.update_one(
        {"id": oid},
        {"$set": {"paid_amount": new_paid, "due_amount": new_due,
                  "status": "completed" if new_due == 0 else order["status"]}},
    )
    if order.get("customer_id"):
        await db.customers.update_one(
            {"id": order["customer_id"]}, {"$inc": {"current_balance": -body.amount}}
        )
    order.update({"paid_amount": new_paid, "due_amount": new_due})
    if new_due == 0:
        order["status"] = "completed"
    return order


# ---------------------------------------------------------------------------
# Invoice PDF
# ---------------------------------------------------------------------------
COMPANY = {
    "name": "Anil Sales Corporation",
    "tagline": "Sanitary & Plumbing Products",
    "address": "Shop No. 12, Main Market Road, Mumbai, Maharashtra 400001",
    "phone": "+91 98765 43210",
    "email": "contact@anilsales.com",
    "gstin": "27AAAAA0000A1Z5",
}


def build_invoice_pdf(order: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", parent=styles["Heading1"], fontName="Helvetica-Bold",
        fontSize=22, leading=26, textColor=colors.HexColor("#0B1220"),
    )
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#475569"))
    label = ParagraphStyle("label", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#64748B"))
    bold = ParagraphStyle("bold", parent=styles["Normal"], fontSize=10, fontName="Helvetica-Bold")

    story = []
    # Header
    header_tbl = Table([[
        Paragraph(f"<b>{COMPANY['name']}</b><br/><font size=9 color='#64748B'>{COMPANY['tagline']}</font>"
                  f"<br/><font size=8 color='#475569'>{COMPANY['address']}</font>"
                  f"<br/><font size=8 color='#475569'>{COMPANY['phone']} • {COMPANY['email']}</font>"
                  f"<br/><font size=8 color='#475569'>GSTIN: {COMPANY['gstin']}</font>", styles["Normal"]),
        Paragraph(f"<para align=right><font size=18 color='#059669'><b>INVOICE</b></font>"
                  f"<br/><font size=10><b>{order['invoice_no']}</b></font>"
                  f"<br/><font size=8 color='#64748B'>Date: {order['created_at'][:19].replace('T',' ')}</font></para>",
                  styles["Normal"]),
    ]], colWidths=[110 * mm, 60 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 6))
    story.append(Table([[""]], colWidths=[170 * mm], rowHeights=[0.5],
                       style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1, colors.HexColor("#10B981"))])))
    story.append(Spacer(1, 10))

    # Bill to
    bill_to = Table([[
        Paragraph(f"<b>BILL TO</b><br/><font size=10>{order['customer_name']}</font>"
                  f"<br/><font size=9 color='#475569'>{order.get('customer_phone','')}</font>", styles["Normal"]),
        Paragraph(f"<para align=right><b>PAYMENT</b><br/><font size=10>{order['payment_method'].upper()}</font>"
                  f"<br/><font size=9 color='#475569'>Status: {order['status'].title()}</font></para>", styles["Normal"]),
    ]], colWidths=[110 * mm, 60 * mm])
    story.append(bill_to)
    story.append(Spacer(1, 14))

    # Items table
    data = [["#", "Item", "SKU", "Qty", "Rate", "Disc", "Total"]]
    for i, it in enumerate(order["items"], 1):
        data.append([
            str(i), it["name"], it.get("sku", ""), f"{it['quantity']:g}",
            f"₹{it['price']:.2f}", f"₹{it['discount']:.2f}", f"₹{it['total']:.2f}"
        ])
    items_tbl = Table(data, colWidths=[10 * mm, 60 * mm, 25 * mm, 15 * mm, 22 * mm, 18 * mm, 25 * mm])
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1220")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, 1), (-1, 1), 0.5, colors.HexColor("#E2E8F0")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 10))

    # Totals
    tot_rows = [
        ["Subtotal", f"₹{order['subtotal']:.2f}"],
        [f"Discount ({order['discount_type']})", f"-₹{order['discount_amount']:.2f}"],
        ["Tax", f"₹{order['tax']:.2f}"],
        ["TOTAL", f"₹{order['total']:.2f}"],
        ["Paid", f"₹{order['paid_amount']:.2f}"],
        ["Due", f"₹{order['due_amount']:.2f}"],
    ]
    tot_tbl = Table(tot_rows, colWidths=[40 * mm, 30 * mm], hAlign="RIGHT")
    tot_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 3), (-1, 3), 0.5, colors.HexColor("#CBD5E1")),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 3), (-1, 3), colors.HexColor("#059669")),
        ("FONTSIZE", (0, 3), (-1, 3), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tot_tbl)
    story.append(Spacer(1, 18))

    # Footer
    if order.get("notes"):
        story.append(Paragraph(f"<b>Notes:</b> {order['notes']}", small))
        story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Thank you for your business. This is a computer-generated invoice and does not require signature.",
        small
    ))

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf


@api.get("/orders/{oid}/invoice.pdf")
async def invoice_pdf(oid: str, request: Request):
    # Allow token via query param (for direct PDF link) or header
    token = request.query_params.get("token") or (
        request.headers.get("Authorization", "")[7:]
        if request.headers.get("Authorization", "").startswith("Bearer ") else None
    )
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pdf_bytes = build_invoice_pdf(order)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{order["invoice_no"]}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Dashboard + Analytics
# ---------------------------------------------------------------------------
def _day_bounds(days: int = 0):
    """Return (start_iso, end_iso) for last `days` days window ending now."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start_iso, _ = _day_bounds(30)

    # Today's revenue
    today_orders = await db.orders.find(
        {"created_at": {"$gte": today_start}}, {"_id": 0, "total": 1, "paid_amount": 1}
    ).to_list(5000)
    today_revenue = sum(o.get("total", 0) for o in today_orders)

    # Total revenue
    all_orders = await db.orders.find({}, {"_id": 0, "total": 1, "created_at": 1, "status": 1}).to_list(100000)
    total_revenue = sum(o.get("total", 0) for o in all_orders)

    # Pending orders
    pending = await db.orders.count_documents({"status": "pending"})

    # Low stock
    low_stock_rows = await db.products.find(
        {"$expr": {"$lte": ["$stock", "$low_stock_threshold"]}}, {"_id": 0}
    ).sort("stock", 1).to_list(50)

    # Customer outstanding total
    total_due = 0.0
    cust_rows = await db.customers.find({}, {"_id": 0, "current_balance": 1}).to_list(5000)
    total_due = sum(c.get("current_balance", 0) for c in cust_rows)

    # Sales trend last 14 days
    trend = {}
    for i in range(13, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        trend[d] = 0.0
    for o in all_orders:
        d = (o.get("created_at") or "")[:10]
        if d in trend:
            trend[d] += o.get("total", 0)
    trend_list = [{"date": k, "revenue": round(v, 2)} for k, v in trend.items()]

    return {
        "today_revenue": round(today_revenue, 2),
        "total_revenue": round(total_revenue, 2),
        "total_orders": len(all_orders),
        "pending_orders": pending,
        "low_stock_items": low_stock_rows,
        "low_stock_count": len(low_stock_rows),
        "total_outstanding": round(total_due, 2),
        "sales_trend": trend_list,
    }


@api.get("/analytics/overview")
async def analytics_overview(days: int = 30, user: dict = Depends(require_admin)):
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    orders = await db.orders.find({"created_at": {"$gte": start}}, {"_id": 0}).to_list(100000)

    # Revenue trend (daily)
    trend = {}
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        trend[d] = {"date": d, "revenue": 0.0, "orders": 0}
    for o in orders:
        d = (o.get("created_at") or "")[:10]
        if d in trend:
            trend[d]["revenue"] += o.get("total", 0)
            trend[d]["orders"] += 1
    trend_list = list(trend.values())
    for t in trend_list:
        t["revenue"] = round(t["revenue"], 2)

    # Payment method breakdown
    pay = {}
    for o in orders:
        m = o.get("payment_method", "other")
        pay[m] = pay.get(m, 0) + o.get("total", 0)
    pay_list = [{"method": k, "value": round(v, 2)} for k, v in pay.items()]

    # Top products
    prod_agg = {}
    cat_agg = {}
    for o in orders:
        for it in o.get("items", []):
            key = it["product_id"]
            if key not in prod_agg:
                prod_agg[key] = {"product_id": key, "name": it["name"], "qty": 0, "revenue": 0.0}
            prod_agg[key]["qty"] += it["quantity"]
            prod_agg[key]["revenue"] += it["total"]
    # fetch categories for products
    pids = list(prod_agg.keys())
    if pids:
        prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "category": 1}).to_list(5000)
        pid_cat = {p["id"]: p.get("category", "General") for p in prods}
        for pid, entry in prod_agg.items():
            cat = pid_cat.get(pid, "General")
            cat_agg[cat] = cat_agg.get(cat, 0) + entry["revenue"]

    top_products = sorted(prod_agg.values(), key=lambda x: x["revenue"], reverse=True)[:8]
    for p in top_products:
        p["revenue"] = round(p["revenue"], 2)
    category_list = [{"category": k, "revenue": round(v, 2)} for k, v in cat_agg.items()]

    # Employee performance
    emp = {}
    for o in orders:
        k = o.get("created_by_name", "Unknown")
        if k not in emp:
            emp[k] = {"name": k, "orders": 0, "revenue": 0.0}
        emp[k]["orders"] += 1
        emp[k]["revenue"] += o.get("total", 0)
    emp_list = sorted(emp.values(), key=lambda x: x["revenue"], reverse=True)
    for e in emp_list:
        e["revenue"] = round(e["revenue"], 2)

    return {
        "days": days,
        "total_revenue": round(sum(o.get("total", 0) for o in orders), 2),
        "total_orders": len(orders),
        "revenue_trend": trend_list,
        "payment_breakdown": pay_list,
        "top_products": top_products,
        "category_breakdown": category_list,
        "employee_performance": emp_list,
    }


# ---------------------------------------------------------------------------
# Seed + startup
# ---------------------------------------------------------------------------
DEFAULT_CATEGORIES = [
    "Faucets", "Wash Basins", "Toilets", "Pipes & Fittings",
    "Showers", "Bath Accessories", "Water Tanks", "Tools",
]

SEED_PRODUCTS = [
    {"name": "Jaquar Continental Pillar Cock", "sku": "FAU-001", "category": "Faucets",
     "unit": "pcs", "cost_price": 850, "selling_price": 1250, "tax_rate": 18, "stock": 42,
     "low_stock_threshold": 10,
     "image_url": "https://images.unsplash.com/photo-1773177930292-463ca3c5b86a?w=400&q=80"},
    {"name": "Cera Wall Mount Basin 22inch", "sku": "BSN-022", "category": "Wash Basins",
     "unit": "pcs", "cost_price": 2400, "selling_price": 3450, "tax_rate": 18, "stock": 12,
     "low_stock_threshold": 5,
     "image_url": "https://images.unsplash.com/photo-1747227830516-b9643cc377fb?w=400&q=80"},
    {"name": "Hindware One-Piece Toilet", "sku": "TOL-101", "category": "Toilets",
     "unit": "pcs", "cost_price": 7800, "selling_price": 10999, "tax_rate": 18, "stock": 6,
     "low_stock_threshold": 3},
    {"name": "Supreme CPVC Pipe 1/2inch x 10ft", "sku": "PIP-012", "category": "Pipes & Fittings",
     "unit": "pcs", "cost_price": 180, "selling_price": 240, "tax_rate": 18, "stock": 220,
     "low_stock_threshold": 50},
    {"name": "Kohler Rainshower Head 8inch", "sku": "SHW-080", "category": "Showers",
     "unit": "pcs", "cost_price": 3200, "selling_price": 4699, "tax_rate": 18, "stock": 18,
     "low_stock_threshold": 5},
    {"name": "Astral PVC Elbow 90 deg 1inch", "sku": "PIP-E90", "category": "Pipes & Fittings",
     "unit": "pcs", "cost_price": 28, "selling_price": 45, "tax_rate": 18, "stock": 840,
     "low_stock_threshold": 200},
    {"name": "Sintex Water Tank 1000L", "sku": "TNK-1K", "category": "Water Tanks",
     "unit": "pcs", "cost_price": 5600, "selling_price": 7500, "tax_rate": 18, "stock": 4,
     "low_stock_threshold": 2},
    {"name": "Stainless Steel Towel Rail 24inch", "sku": "ACC-TR24", "category": "Bath Accessories",
     "unit": "pcs", "cost_price": 380, "selling_price": 649, "tax_rate": 18, "stock": 55,
     "low_stock_threshold": 10},
    {"name": "Teflon Tape 0.5inch x 10m", "sku": "TOL-TT10", "category": "Tools",
     "unit": "pcs", "cost_price": 8, "selling_price": 15, "tax_rate": 12, "stock": 2000,
     "low_stock_threshold": 200},
    {"name": "Parryware Single Lever Basin Mixer", "sku": "FAU-SLM", "category": "Faucets",
     "unit": "pcs", "cost_price": 2100, "selling_price": 2999, "tax_rate": 18, "stock": 24,
     "low_stock_threshold": 6},
    {"name": "Hindware Urinal (White)", "sku": "TOL-URN", "category": "Toilets",
     "unit": "pcs", "cost_price": 2800, "selling_price": 3999, "tax_rate": 18, "stock": 9,
     "low_stock_threshold": 3},
    {"name": "Bathroom Mirror 24x18 LED", "sku": "ACC-MIR", "category": "Bath Accessories",
     "unit": "pcs", "cost_price": 1800, "selling_price": 2799, "tax_rate": 18, "stock": 14,
     "low_stock_threshold": 4},
]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("id", unique=True)
    await db.customers.create_index("id", unique=True)
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("invoice_no", unique=True)
    await db.orders.create_index("created_at")
    await db.categories.create_index("name", unique=True)


async def seed():
    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@anilsales.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "email": admin_email,
            "name": "Admin", "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": now_iso(),
        })
        logger.info("Seeded admin %s", admin_email)
    else:
        # Update pwd if mismatch (makes it idempotent w.r.t. env changes)
        if not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}},
            )

    # Demo employee
    emp_email = "staff@anilsales.com"
    if not await db.users.find_one({"email": emp_email}):
        await db.users.insert_one({
            "id": new_id(), "email": emp_email,
            "name": "Ravi (Staff)", "role": "employee",
            "password_hash": hash_password("Staff@123"),
            "created_at": now_iso(),
        })

    # Categories
    for c in DEFAULT_CATEGORIES:
        await db.categories.update_one(
            {"name": c},
            {"$setOnInsert": {"id": new_id(), "name": c, "created_at": now_iso()}},
            upsert=True,
        )

    # Products (only if none)
    count = await db.products.count_documents({})
    if count == 0:
        now = now_iso()
        docs = []
        for p in SEED_PRODUCTS:
            docs.append({
                **p, "id": new_id(),
                "description": "", "hsn": "",
                "image_url": p.get("image_url", ""),
                "created_at": now, "updated_at": now,
            })
        await db.products.insert_many(docs)
        logger.info("Seeded %d products", len(docs))

    # Customers
    if await db.customers.count_documents({}) == 0:
        demo_customers = [
            {"name": "Sharma Plumbing Works", "phone": "9820011223",
             "address": "Andheri West, Mumbai", "email": "sharma@plumb.in",
             "gstin": "27AAACS1234A1Z5", "credit_limit": 50000.0, "current_balance": 0.0},
            {"name": "Kumar Hardware Store", "phone": "9930022334",
             "address": "Thane West, Mumbai", "email": "", "gstin": "",
             "credit_limit": 25000.0, "current_balance": 0.0},
            {"name": "Modern Builders Pvt Ltd", "phone": "9870033445",
             "address": "Bandra Kurla Complex", "email": "ops@modernbuild.com",
             "gstin": "27AACCM9988B1Z2", "credit_limit": 200000.0, "current_balance": 0.0},
        ]
        for c in demo_customers:
            c["id"] = new_id()
            c["created_at"] = now_iso()
        await db.customers.insert_many(demo_customers)


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        await seed()
    except Exception as e:
        logger.exception("Startup seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
