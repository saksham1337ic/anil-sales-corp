import React, { useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, Phone, MapPin, Mail, IndianRupee, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, fmtINR, fmtDate } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";

const EMPTY = { name: "", phone: "", email: "", address: "", gstin: "", credit_limit: 0 };

export default function Customers() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [list, setList] = useState([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [drawerCustomer, setDrawerCustomer] = useState(null);
    const [drawerOrders, setDrawerOrders] = useState([]);

    async function load() {
        const params = q ? { q } : {};
        const { data } = await api.get("/customers", { params });
        setList(data);
    }
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);

    function openCreate() { setEditing(null); setForm(EMPTY); setOpen(true); }
    function openEdit(c) { setEditing(c); setForm({ ...EMPTY, ...c }); setOpen(true); }

    async function save() {
        setSaving(true);
        try {
            const payload = { ...form, credit_limit: Number(form.credit_limit) || 0 };
            if (editing) await api.patch(`/customers/${editing.id}`, payload);
            else await api.post("/customers", payload);
            toast.success("Saved");
            setOpen(false);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Save failed");
        } finally { setSaving(false); }
    }
    async function remove(c) {
        if (!confirm(`Delete customer "${c.name}"?`)) return;
        try { await api.delete(`/customers/${c.id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
    }
    async function openDrawer(c) {
        setDrawerCustomer(c);
        const { data } = await api.get(`/customers/${c.id}/orders`);
        setDrawerOrders(data);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Directory</div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Customers</h1>
                    <p className="text-sm text-muted-foreground mt-1">{list.length} customers · manage credit & history</p>
                </div>
                <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20" data-testid="customer-add-btn">
                    <Plus size={16} /> Add Customer
                </Button>
            </div>

            <div className="relative max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone…" className="pl-10 h-10 bg-card border-border" data-testid="customer-search-input" />
            </div>

            <div className="panel overflow-hidden">
                <div className="overflow-x-auto scroll-fade">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium">Customer</th>
                                <th className="text-left px-3 py-3 font-medium">Contact</th>
                                <th className="text-right px-3 py-3 font-medium">Credit limit</th>
                                <th className="text-right px-3 py-3 font-medium">Outstanding</th>
                                <th className="text-right px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((c) => (
                                <tr key={c.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => openDrawer(c)} data-testid={`customer-row-${c.id}`}>
                                    <td className="px-5 py-3">
                                        <div className="font-medium">{c.name}</div>
                                        <div className="text-xs text-muted-foreground">{c.gstin || "—"}</div>
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">
                                        <div className="flex items-center gap-1.5"><Phone size={12} />{c.phone || "—"}</div>
                                        <div className="flex items-center gap-1.5 text-xs">{c.email && <><Mail size={11} />{c.email}</>}</div>
                                    </td>
                                    <td className="px-3 py-3 text-right">{fmtINR(c.credit_limit)}</td>
                                    <td className="px-3 py-3 text-right" data-testid="customer-balance-badge">
                                        <Badge variant="outline" className={c.current_balance > 0 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-primary/15 text-primary border-primary/30"}>
                                            {fmtINR(c.current_balance)}
                                        </Badge>
                                    </td>
                                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="inline-flex gap-1">
                                            <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                                            {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(c)} className="text-destructive hover:text-destructive"><Trash2 size={14} /></Button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {list.length === 0 && (
                                <tr><td colSpan={5} className="px-5 py-16 text-center text-muted-foreground">No customers yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading">{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
                        <DialogDescription>Customer profile and credit settings.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 space-y-1.5">
                            <Label>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-muted/30 border-border" data-testid="customer-form-name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-muted/30 border-border" data-testid="customer-form-phone" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>GSTIN</Label>
                            <Input value={form.gstin || ""} onChange={(e) => setForm({ ...form, gstin: e.target.value })} className="bg-muted/30 border-border font-mono" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Credit limit</Label>
                            <Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                            <Label>Address</Label>
                            <Textarea rows={2} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-muted/30 border-border" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2" data-testid="customer-form-save-btn">
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {editing ? "Save changes" : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={!!drawerCustomer} onOpenChange={(v) => !v && setDrawerCustomer(null)}>
                <SheetContent className="bg-card border-border w-full sm:max-w-lg overflow-y-auto scroll-fade">
                    <SheetHeader>
                        <SheetTitle className="font-heading text-xl">{drawerCustomer?.name}</SheetTitle>
                        <SheetDescription>{drawerCustomer?.phone}</SheetDescription>
                    </SheetHeader>
                    {drawerCustomer && (
                        <div className="mt-6 space-y-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="panel p-4">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Credit Limit</div>
                                    <div className="font-heading text-xl font-semibold mt-1">{fmtINR(drawerCustomer.credit_limit)}</div>
                                </div>
                                <div className="panel p-4">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</div>
                                    <div className="font-heading text-xl font-semibold mt-1 text-amber-400">{fmtINR(drawerCustomer.current_balance)}</div>
                                </div>
                            </div>
                            {drawerCustomer.address && (
                                <div className="text-sm text-muted-foreground flex items-start gap-2"><MapPin size={14} className="mt-0.5" />{drawerCustomer.address}</div>
                            )}
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Recent orders</div>
                                <div className="space-y-2">
                                    {drawerOrders.map((o) => (
                                        <div key={o.id} className="panel p-3 flex items-center justify-between">
                                            <div>
                                                <div className="font-mono text-xs">{o.invoice_no}</div>
                                                <div className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-medium">{fmtINR(o.total)}</div>
                                                <Badge variant="outline" className="mt-1 text-[10px]">{o.status}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                    {drawerOrders.length === 0 && (
                                        <div className="text-sm text-muted-foreground text-center py-6">No orders yet</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
