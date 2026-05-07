import React, { useEffect, useState } from "react";
import {
    Search, Plus, Pencil, Trash2, Package, Boxes, Loader2,
    AlertTriangle, ArrowDown, ArrowUp,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmtINR } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";

const EMPTY = {
    name: "", sku: "", category: "General", unit: "pcs",
    cost_price: 0, selling_price: 0, tax_rate: 18,
    stock: 0, low_stock_threshold: 10, hsn: "", description: "", image_url: "",
};

export default function Products() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [list, setList] = useState([]);
    const [cats, setCats] = useState([]);
    const [q, setQ] = useState("");
    const [activeCat, setActiveCat] = useState("all");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [adjustProduct, setAdjustProduct] = useState(null);
    const [adjustQty, setAdjustQty] = useState(0);
    const [adjustReason, setAdjustReason] = useState("receipt");
    const [adjustNote, setAdjustNote] = useState("");

    async function load() {
        const params = {};
        if (q) params.q = q;
        if (activeCat !== "all") params.category = activeCat;
        const { data } = await api.get("/products", { params });
        setList(data);
    }
    useEffect(() => { api.get("/categories").then((r) => setCats(r.data)); }, []);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, activeCat]);

    function openCreate() {
        setEditing(null);
        setForm(EMPTY);
        setOpen(true);
    }
    function openEdit(p) {
        setEditing(p);
        setForm({ ...EMPTY, ...p });
        setOpen(true);
    }
    async function save() {
        setSaving(true);
        try {
            const payload = {
                ...form,
                cost_price: Number(form.cost_price) || 0,
                selling_price: Number(form.selling_price) || 0,
                tax_rate: Number(form.tax_rate) || 0,
                stock: Number(form.stock) || 0,
                low_stock_threshold: Number(form.low_stock_threshold) || 0,
            };
            if (editing) {
                const { stock, ...rest } = payload;
                await api.patch(`/products/${editing.id}`, rest);
                toast.success("Product updated");
            } else {
                await api.post("/products", payload);
                toast.success("Product added");
            }
            setOpen(false);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Save failed");
        } finally {
            setSaving(false);
        }
    }
    async function remove(p) {
        if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/products/${p.id}`);
            toast.success("Deleted");
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Delete failed");
        }
    }
    function openAdjust(p) {
        setAdjustProduct(p);
        setAdjustQty(0);
        setAdjustReason("receipt");
        setAdjustNote("");
        setAdjustOpen(true);
    }
    async function saveAdjust() {
        if (!Number(adjustQty)) return toast.error("Quantity cannot be zero");
        try {
            const sign = adjustReason === "damage" || adjustReason === "return-out" ? -1 : 1;
            const qty = Math.abs(Number(adjustQty)) * sign;
            await api.post("/products/adjust-stock", {
                product_id: adjustProduct.id,
                quantity: qty,
                reason: adjustReason,
                note: adjustNote,
            });
            toast.success("Stock updated");
            setAdjustOpen(false);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Adjust failed");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Inventory</div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Products</h1>
                    <p className="text-sm text-muted-foreground mt-1">{list.length} items in catalogue</p>
                </div>
                <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20" data-testid="product-add-btn">
                    <Plus size={16} /> Add Product
                </Button>
            </div>

            {/* filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / SKU…" className="pl-10 h-10 bg-card border-border" data-testid="product-search-input" />
                </div>
                <Select value={activeCat} onValueChange={setActiveCat}>
                    <SelectTrigger className="w-full sm:w-56 h-10 bg-card border-border" data-testid="product-category-filter">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                        <SelectItem value="all">All categories</SelectItem>
                        {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {/* table */}
            <div className="panel overflow-hidden">
                <div className="overflow-x-auto scroll-fade">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium">Product</th>
                                <th className="text-left px-3 py-3 font-medium">SKU</th>
                                <th className="text-left px-3 py-3 font-medium">Category</th>
                                <th className="text-right px-3 py-3 font-medium">Cost</th>
                                <th className="text-right px-3 py-3 font-medium">Price</th>
                                <th className="text-right px-3 py-3 font-medium">Stock</th>
                                <th className="text-right px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((p) => {
                                const low = p.stock <= p.low_stock_threshold;
                                return (
                                    <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors" data-testid={`product-row-${p.sku}`}>
                                        <td className="px-5 py-3">
                                            <div className="font-medium">{p.name}</div>
                                            <div className="text-xs text-muted-foreground">{p.unit} · GST {p.tax_rate}%</div>
                                        </td>
                                        <td className="px-3 py-3 font-mono text-xs">{p.sku}</td>
                                        <td className="px-3 py-3 text-muted-foreground">{p.category}</td>
                                        <td className="px-3 py-3 text-right text-muted-foreground">{fmtINR(p.cost_price)}</td>
                                        <td className="px-3 py-3 text-right font-medium">{fmtINR(p.selling_price)}</td>
                                        <td className="px-3 py-3 text-right">
                                            <Badge variant="outline" className={
                                                p.stock <= 0 ? "bg-destructive/15 text-destructive border-destructive/40"
                                                : low ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                : "bg-primary/15 text-primary border-primary/30"
                                            }>
                                                {low && <AlertTriangle size={10} className="mr-1" />}
                                                {p.stock} {p.unit}
                                            </Badge>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="inline-flex gap-1">
                                                <Button size="icon" variant="ghost" onClick={() => openAdjust(p)} title="Adjust stock" data-testid={`product-adjust-${p.sku}`}>
                                                    <Boxes size={15} />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Edit" data-testid={`product-edit-${p.sku}`}>
                                                    <Pencil size={14} />
                                                </Button>
                                                {isAdmin && (
                                                    <Button size="icon" variant="ghost" onClick={() => remove(p)} title="Delete" className="text-destructive hover:text-destructive" data-testid={`product-delete-${p.sku}`}>
                                                        <Trash2 size={14} />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {list.length === 0 && (
                                <tr><td colSpan={7} className="px-5 py-16 text-center text-muted-foreground">
                                    <Package size={28} className="mx-auto mb-2 opacity-40" /> No products found
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add / edit dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading">{editing ? "Edit Product" : "New Product"}</DialogTitle>
                        <DialogDescription>Configure name, pricing and stock thresholds.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 space-y-1.5">
                            <Label>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-muted/30 border-border" data-testid="product-form-name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>SKU</Label>
                            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} className="font-mono bg-muted/30 border-border" data-testid="product-form-sku" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-muted/30 border-border" list="cats" data-testid="product-form-category" />
                            <datalist id="cats">{cats.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Unit</Label>
                            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>HSN code</Label>
                            <Input value={form.hsn || ""} onChange={(e) => setForm({ ...form, hsn: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Cost price</Label>
                            <Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Selling price</Label>
                            <Input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="bg-muted/30 border-border" data-testid="product-form-price" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Tax rate (%)</Label>
                            <Input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Low-stock threshold</Label>
                            <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        {!editing && (
                            <div className="space-y-1.5">
                                <Label>Opening stock</Label>
                                <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="bg-muted/30 border-border" data-testid="product-form-stock" />
                            </div>
                        )}
                        <div className="md:col-span-2 space-y-1.5">
                            <Label>Description</Label>
                            <Textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2" data-testid="product-form-save-btn">
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {editing ? "Save changes" : "Create product"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Adjust stock sheet */}
            <Sheet open={adjustOpen} onOpenChange={setAdjustOpen}>
                <SheetContent className="bg-card border-border" data-testid="stock-adjust-sheet">
                    <SheetHeader>
                        <SheetTitle className="font-heading">Adjust stock</SheetTitle>
                        <SheetDescription>{adjustProduct?.name} · current: {adjustProduct?.stock} {adjustProduct?.unit}</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 mt-6">
                        <div className="space-y-1.5">
                            <Label>Reason</Label>
                            <Select value={adjustReason} onValueChange={setAdjustReason}>
                                <SelectTrigger className="bg-muted/30 border-border" data-testid="stock-adjust-reason">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border">
                                    <SelectItem value="receipt"><ArrowUp size={12} className="inline mr-1.5 text-primary" />New stock receipt</SelectItem>
                                    <SelectItem value="return-in"><ArrowUp size={12} className="inline mr-1.5 text-primary" />Customer return (in)</SelectItem>
                                    <SelectItem value="adjustment"><ArrowUp size={12} className="inline mr-1.5 text-primary" />Manual adjustment</SelectItem>
                                    <SelectItem value="damage"><ArrowDown size={12} className="inline mr-1.5 text-destructive" />Damage / loss</SelectItem>
                                    <SelectItem value="return-out"><ArrowDown size={12} className="inline mr-1.5 text-destructive" />Return to supplier</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Quantity</Label>
                            <Input type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="bg-muted/30 border-border" data-testid="stock-adjust-qty" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Note</Label>
                            <Textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="bg-muted/30 border-border" />
                        </div>
                        <Button onClick={saveAdjust} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="stock-adjust-save-btn">
                            Apply adjustment
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
