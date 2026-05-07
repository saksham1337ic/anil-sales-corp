import React, { useEffect, useMemo, useState } from "react";
import {
    Search, Plus, Minus, Trash2, ShoppingCart, User, Banknote,
    CreditCard, Smartphone, FileCheck2, Building2, X, Receipt as ReceiptIcon,
    Package, Loader2, Tag, Truck, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmtINR } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import InvoiceModal from "@/components/InvoiceModal";

const PAY_METHODS = [
    { v: "cash", label: "Cash", icon: Banknote },
    { v: "upi", label: "UPI", icon: Smartphone },
    { v: "bank", label: "Bank", icon: Building2 },
    { v: "cheque", label: "Cheque", icon: FileCheck2 },
    { v: "credit", label: "Credit", icon: CreditCard },
];

export default function POS() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [activeCat, setActiveCat] = useState("all");
    const [q, setQ] = useState("");
    const [cart, setCart] = useState([]); // {id, name, sku, qty, price, discount, stock}
    const [customers, setCustomers] = useState([]);
    const [customerId, setCustomerId] = useState("walkin");
    const [walkinName, setWalkinName] = useState("Walk-in Customer");
    const [walkinPhone, setWalkinPhone] = useState("");
    const [discountType, setDiscountType] = useState("percent");
    const [discountValue, setDiscountValue] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [paidAmount, setPaidAmount] = useState("");
    const [notes, setNotes] = useState("");
    const [isDelivery, setIsDelivery] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [deliveryCharges, setDeliveryCharges] = useState("");
    const [isLabour, setIsLabour] = useState(false);
    const [labourDescription, setLabourDescription] = useState("");
    const [labourCharges, setLabourCharges] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [invoice, setInvoice] = useState(null);

    async function loadProducts() {
        const params = {};
        if (q) params.q = q;
        if (activeCat !== "all") params.category = activeCat;
        const { data } = await api.get("/products", { params });
        setProducts(data);
    }

    useEffect(() => {
        api.get("/categories").then((r) => setCategories(r.data));
        api.get("/customers").then((r) => setCustomers(r.data));
    }, []);

    useEffect(() => {
        const t = setTimeout(loadProducts, 200);
        return () => clearTimeout(t);
    }, [q, activeCat]);

    function addToCart(p) {
        setCart((c) => {
            const existing = c.find((x) => x.id === p.id);
            if (existing) {
                if (existing.qty + 1 > p.stock) {
                    toast.error(`Only ${p.stock} ${p.unit} of ${p.name} available`);
                    return c;
                }
                return c.map((x) => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
            }
            if (p.stock <= 0) {
                toast.error(`${p.name} is out of stock`);
                return c;
            }
            return [...c, { id: p.id, name: p.name, sku: p.sku, qty: 1, price: p.selling_price, discount: 0, stock: p.stock, unit: p.unit }];
        });
    }

    function updateQty(id, delta) {
        setCart((c) =>
            c.map((x) => {
                if (x.id !== id) return x;
                const nextQty = x.qty + delta;
                if (nextQty < 1) return x;
                if (nextQty > x.stock) {
                    toast.error(`Only ${x.stock} available`);
                    return x;
                }
                return { ...x, qty: nextQty };
            })
        );
    }

    function setLine(id, patch) {
        setCart((c) => c.map((x) => x.id === id ? { ...x, ...patch } : x));
    }

    function removeFromCart(id) {
        setCart((c) => c.filter((x) => x.id !== id));
    }

    const totals = useMemo(() => {
        const subtotal = cart.reduce((s, x) => s + x.qty * x.price - (x.discount || 0), 0);
        const disc = discountType === "percent"
            ? subtotal * (Number(discountValue) || 0) / 100
            : Math.min(Number(discountValue) || 0, subtotal);
        const delivery = isDelivery ? Math.max(0, Number(deliveryCharges) || 0) : 0;
        const labour = isLabour ? Math.max(0, Number(labourCharges) || 0) : 0;
        const total = Math.max(0, subtotal - disc + delivery + labour);
        return { subtotal, disc, delivery, labour, total };
    }, [cart, discountType, discountValue, isDelivery, deliveryCharges, isLabour, labourCharges]);

    async function checkout() {
        if (!cart.length) return toast.error("Cart is empty");
        if (isDelivery && !deliveryAddress.trim()) return toast.error("Delivery address is required");
        setSubmitting(true);
        try {
            const payload = {
                customer_id: customerId === "walkin" ? null : customerId,
                customer_name: customerId === "walkin" ? walkinName || "Walk-in Customer" : null,
                customer_phone: customerId === "walkin" ? walkinPhone : null,
                items: cart.map((x) => ({
                    product_id: x.id, quantity: x.qty, price: x.price, discount: x.discount || 0,
                })),
                discount_type: discountType,
                discount_value: Number(discountValue) || 0,
                payment_method: paymentMethod,
                paid_amount: Number(paidAmount) || 0,
                notes,
                is_delivery: isDelivery,
                delivery_address: isDelivery ? deliveryAddress.trim() : "",
                delivery_charges: isDelivery ? (Number(deliveryCharges) || 0) : 0,
                is_labour: isLabour,
                labour_description: isLabour ? labourDescription.trim() : "",
                labour_charges: isLabour ? (Number(labourCharges) || 0) : 0,
            };
            const { data } = await api.post("/pos/checkout", payload);
            toast.success(`Invoice ${data.invoice_no} created`);
            setInvoice(data);
            // reset
            setCart([]);
            setDiscountValue(0);
            setPaidAmount("");
            setNotes("");
            setIsDelivery(false);
            setDeliveryAddress("");
            setDeliveryCharges("");
            setIsLabour(false);
            setLabourDescription("");
            setLabourCharges("");
            loadProducts();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Checkout failed");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-6">
            {/* LEFT: catalog */}
            <div className="lg:col-span-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search by name, SKU…"
                            className="pl-10 h-11 bg-card border-border"
                            data-testid="pos-search-input"
                            autoFocus
                        />
                    </div>
                    <Badge variant="outline" className="border-border text-muted-foreground py-2 px-3">
                        <Package size={12} className="mr-1.5" />
                        {products.length} items
                    </Badge>
                </div>

                <div className="flex gap-2 overflow-auto scroll-fade pb-1 -mx-1 px-1">
                    {[{ id: "all", name: "All" }, ...categories].map((c) => (
                        <button
                            key={c.id || c.name}
                            onClick={() => setActiveCat(c.name === "All" ? "all" : c.name)}
                            data-testid={`pos-category-${c.name}`}
                            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                (activeCat === "all" && c.name === "All") || activeCat === c.name
                                    ? "bg-primary/15 text-primary border-primary/40"
                                    : "bg-muted/30 text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground/30"
                            }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {products.map((p) => {
                        const low = p.stock <= p.low_stock_threshold;
                        const out = p.stock <= 0;
                        return (
                            <button
                                key={p.id}
                                onClick={() => addToCart(p)}
                                disabled={out}
                                data-testid={`pos-product-${p.sku}`}
                                className="text-left panel p-4 hover:border-primary/50 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-medium text-sm leading-tight line-clamp-2">{p.name}</div>
                                        <div className="text-[11px] text-muted-foreground font-mono mt-1">{p.sku}</div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={
                                            out ? "bg-destructive/20 text-destructive border-destructive/40"
                                                : low ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                : "bg-primary/15 text-primary border-primary/30"
                                        }
                                    >
                                        {p.stock} {p.unit}
                                    </Badge>
                                </div>
                                <div className="mt-4 flex items-end justify-between">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</div>
                                        <div className="font-heading font-semibold text-base">{fmtINR(p.selling_price)}</div>
                                    </div>
                                    <div className="text-xs text-primary font-medium flex items-center gap-1">
                                        <Plus size={14} /> Add
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {products.length === 0 && (
                        <div className="col-span-full text-center py-16 text-muted-foreground">
                            <Package size={32} className="mx-auto mb-2 opacity-40" />
                            No products match
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: cart */}
            <div className="lg:col-span-5 lg:sticky lg:top-20 self-start">
                <div className="panel flex flex-col overflow-hidden" style={{ height: "calc(100vh - 6rem)" }}>
                    <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <ShoppingCart size={18} className="text-primary" />
                            <h3 className="font-heading text-base font-semibold">Current Sale</h3>
                            {cart.length > 0 && (
                                <Badge variant="outline" className="ml-1 bg-primary/10 text-primary border-primary/30 font-mono text-[10px]">
                                    {cart.reduce((s, x) => s + x.qty, 0)} pcs
                                </Badge>
                            )}
                        </div>
                        {cart.length > 0 && (
                            <button
                                onClick={() => setCart([])}
                                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                                data-testid="pos-clear-cart-btn"
                            >
                                <X size={12} /> Clear
                            </button>
                        )}
                    </div>

                    {/* customer */}
                    <div className="px-5 py-2.5 border-b border-border space-y-2 shrink-0">
                        <div className="flex items-center gap-2">
                            <User size={13} className="text-muted-foreground shrink-0" />
                            <Select value={customerId} onValueChange={setCustomerId}>
                                <SelectTrigger className="h-8 bg-muted/30 border-border text-sm" data-testid="pos-customer-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border max-h-72">
                                    <SelectItem value="walkin">Walk-in Customer</SelectItem>
                                    {customers.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {customerId === "walkin" && (
                            <div className="grid grid-cols-2 gap-2">
                                <Input value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Name" className="h-8 bg-muted/30 border-border text-sm" data-testid="pos-walkin-name" />
                                <Input value={walkinPhone} onChange={(e) => setWalkinPhone(e.target.value)} placeholder="Phone (optional)" className="h-8 bg-muted/30 border-border text-sm" data-testid="pos-walkin-phone" />
                            </div>
                        )}
                    </div>

                    {/* items */}
                    <div className="flex-1 overflow-auto scroll-fade px-5 py-3">
                        {cart.length === 0 && (
                            <div className="py-14 text-center text-sm text-muted-foreground">
                                <ShoppingCart size={32} className="mx-auto mb-3 opacity-40" />
                                <div className="font-medium">Cart is empty</div>
                                <div className="text-xs mt-1">Tap a product to add it</div>
                            </div>
                        )}
                        {cart.map((x) => (
                            <div key={x.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0" data-testid={`pos-cart-item-${x.sku}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium leading-snug">{x.name}</div>
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 font-mono">{x.sku}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex items-center bg-muted/40 rounded-md border border-border">
                                            <button onClick={() => updateQty(x.id, -1)} className="px-2 py-1 hover:text-primary"><Minus size={12} /></button>
                                            <Input
                                                value={x.qty}
                                                onChange={(e) => {
                                                    const n = Math.max(1, Math.min(Number(e.target.value) || 1, x.stock));
                                                    setLine(x.id, { qty: n });
                                                }}
                                                className="w-10 h-7 text-center bg-transparent border-0 px-0 text-sm font-medium focus-visible:ring-0"
                                                data-testid={`pos-cart-qty-${x.sku}`}
                                            />
                                            <button onClick={() => updateQty(x.id, +1)} className="px-2 py-1 hover:text-primary"><Plus size={12} /></button>
                                        </div>
                                        <span className="text-xs text-muted-foreground">×</span>
                                        <Input
                                            type="number"
                                            value={x.price}
                                            onChange={(e) => setLine(x.id, { price: Number(e.target.value) || 0 })}
                                            className="w-20 h-7 bg-muted/40 border-border text-xs"
                                            placeholder="Price"
                                        />
                                    </div>
                                </div>
                                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                    <div className="font-heading font-semibold text-sm text-primary">{fmtINR(x.qty * x.price - (x.discount || 0))}</div>
                                    <button onClick={() => removeFromCart(x.id)} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* totals */}
                    <div className="px-5 py-3 border-t border-border space-y-2.5 bg-muted/10 shrink-0">
                        <div className="flex items-center gap-2">
                            <Tag size={13} className="text-muted-foreground" />
                            <Tabs value={discountType} onValueChange={setDiscountType} className="flex-1">
                                <TabsList className="h-7 p-0.5 bg-muted/40 border border-border w-full grid grid-cols-2">
                                    <TabsTrigger value="percent" className="text-xs h-6">%</TabsTrigger>
                                    <TabsTrigger value="fixed" className="text-xs h-6">₹</TabsTrigger>
                                </TabsList>
                            </Tabs>
                            <Input
                                type="number"
                                value={discountValue}
                                onChange={(e) => setDiscountValue(e.target.value)}
                                className="w-20 h-7 bg-muted/30 border-border text-xs"
                                placeholder="0"
                                data-testid="pos-discount-input"
                            />
                        </div>

                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtINR(totals.subtotal)}</span></div>
                            <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>-{fmtINR(totals.disc)}</span></div>
                            {isDelivery && (
                                <div className="flex justify-between text-secondary"><span>Delivery</span><span>+{fmtINR(totals.delivery)}</span></div>
                            )}
                            {isLabour && (
                                <div className="flex justify-between text-amber-400"><span>Labour</span><span>+{fmtINR(totals.labour)}</span></div>
                            )}
                            <div className="flex justify-between font-heading text-lg font-semibold pt-1 border-t border-border" data-testid="pos-cart-total">
                                <span>Total</span><span className="text-primary">{fmtINR(totals.total)}</span>
                            </div>
                        </div>

                        {/* compact extras: delivery + labour as inline checkboxes */}
                        <div className="flex items-center gap-4 text-sm">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <Checkbox
                                    checked={isDelivery}
                                    onCheckedChange={(v) => setIsDelivery(!!v)}
                                    data-testid="pos-delivery-checkbox"
                                />
                                <Truck size={13} className="text-secondary" />
                                <span className="font-medium">Delivery</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <Checkbox
                                    checked={isLabour}
                                    onCheckedChange={(v) => setIsLabour(!!v)}
                                    data-testid="pos-labour-checkbox"
                                />
                                <Wrench size={13} className="text-amber-400" />
                                <span className="font-medium">Labour</span>
                            </label>
                        </div>

                        {isDelivery && (
                            <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2 animate-in-up">
                                <Textarea
                                    rows={2}
                                    value={deliveryAddress}
                                    onChange={(e) => setDeliveryAddress(e.target.value)}
                                    placeholder="Delivery address"
                                    className="bg-card border-border text-sm"
                                    data-testid="pos-delivery-address"
                                />
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Charges ₹</span>
                                    <Input
                                        type="number"
                                        value={deliveryCharges}
                                        onChange={(e) => setDeliveryCharges(e.target.value)}
                                        placeholder="0"
                                        className="h-7 bg-card border-border text-xs"
                                        data-testid="pos-delivery-charges"
                                    />
                                </div>
                            </div>
                        )}
                        {isLabour && (
                            <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2 animate-in-up">
                                <Input
                                    value={labourDescription}
                                    onChange={(e) => setLabourDescription(e.target.value)}
                                    placeholder="Description (e.g. Plumbing fix, fitting…)"
                                    className="h-7 bg-card border-border text-xs"
                                    data-testid="pos-labour-description"
                                />
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Charges ₹</span>
                                    <Input
                                        type="number"
                                        value={labourCharges}
                                        onChange={(e) => setLabourCharges(e.target.value)}
                                        placeholder="0"
                                        className="h-7 bg-card border-border text-xs"
                                        data-testid="pos-labour-charges"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-5 gap-1.5">
                            {PAY_METHODS.map((m) => (
                                <button
                                    key={m.v}
                                    onClick={() => setPaymentMethod(m.v)}
                                    data-testid={`pos-pay-${m.v}`}
                                    className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] font-medium uppercase tracking-wider transition-all ${
                                        paymentMethod === m.v
                                            ? "bg-primary/15 text-primary border-primary/40"
                                            : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <m.icon size={14} />
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {paymentMethod === "credit" && (
                            <Input
                                type="number"
                                value={paidAmount}
                                onChange={(e) => setPaidAmount(e.target.value)}
                                placeholder="Amount paid now (optional)"
                                className="h-9 bg-muted/30 border-border text-sm"
                                data-testid="pos-paid-amount"
                            />
                        )}

                        <Button
                            onClick={checkout}
                            disabled={submitting || cart.length === 0}
                            className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20 font-medium"
                            data-testid="pos-checkout-btn"
                        >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ReceiptIcon size={16} />}
                            {submitting ? "Processing" : `Charge ${fmtINR(totals.total)}`}
                        </Button>
                    </div>
                </div>
            </div>

            <InvoiceModal order={invoice} onClose={() => setInvoice(null)} />
        </div>
    );
}
