import React, { useEffect, useState } from "react";
import { Search, FileText, IndianRupee, ArrowRight, XCircle, Truck, Download, Calendar as CalIcon, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { api, fmtINR, fmtDate, API_BASE, tokenStore } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import InvoiceModal from "@/components/InvoiceModal";

const STATUSES = [
    { v: "all", label: "All" },
    { v: "pending", label: "Pending" },
    { v: "dispatched", label: "Dispatched" },
    { v: "completed", label: "Completed" },
    { v: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dispatched: "bg-secondary/20 text-secondary border-secondary/40",
    completed: "bg-primary/15 text-primary border-primary/30",
    cancelled: "bg-destructive/15 text-destructive border-destructive/40",
};

export default function Orders() {
    const [list, setList] = useState([]);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [openInvoice, setOpenInvoice] = useState(null);
    const [cancelOrder, setCancelOrder] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelling, setCancelling] = useState(false);

    async function load() {
        const params = {};
        if (q) params.q = q;
        if (status !== "all") params.status_ = status;
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const { data } = await api.get("/orders", { params });
        setList(data);
    }
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, status, fromDate, toDate]);

    function setRange(days) {
        const today = new Date();
        const to = today.toISOString().slice(0, 10);
        const from = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
        setFromDate(from);
        setToDate(to);
    }
    function setThisMonth() {
        const d = new Date();
        const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
        const to = d.toISOString().slice(0, 10);
        setFromDate(from);
        setToDate(to);
    }
    function clearRange() {
        setFromDate("");
        setToDate("");
    }

    function exportCsv() {
        const token = tokenStore.get();
        const params = new URLSearchParams({ token });
        if (q) params.set("q", q);
        if (status !== "all") params.set("status_", status);
        if (fromDate) params.set("from_date", fromDate);
        if (toDate) params.set("to_date", toDate);
        const url = `${API_BASE}/orders/export.csv?${params.toString()}`;
        window.open(url, "_blank");
        toast.success(`Exporting ${list.length} orders…`);
    }

    const totalRevenue = list.reduce((s, o) => o.status === "cancelled" ? s : s + (o.total || 0), 0);

    async function changeStatus(o, next) {
        try {
            const { data } = await api.patch(`/orders/${o.id}/status`, { status: next });
            toast.success(`Marked ${next}`);
            setList((rows) => rows.map((r) => (r.id === o.id ? data : r)));
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Update failed");
        }
    }

    async function doCancel() {
        if (!cancelOrder) return;
        setCancelling(true);
        try {
            const { data } = await api.post(`/orders/${cancelOrder.id}/cancel`, { reason: cancelReason });
            toast.success(`Order ${cancelOrder.invoice_no} cancelled · stock restored`);
            setList((rows) => rows.map((r) => (r.id === cancelOrder.id ? data : r)));
            setCancelOrder(null);
            setCancelReason("");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Cancel failed");
        } finally {
            setCancelling(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Sales</div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Orders & Invoices</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {list.length} records · revenue <span className="text-primary font-semibold">{fmtINR(totalRevenue)}</span>
                    </p>
                </div>
                <Button onClick={exportCsv} variant="outline" className="gap-2 border-border" data-testid="orders-export-btn">
                    <Download size={14} /> Export CSV
                </Button>
            </div>

            {/* date range + presets */}
            <div className="panel p-4 flex flex-wrap items-end gap-3" data-testid="orders-date-filter">
                <div className="flex items-end gap-2">
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                        <div className="relative">
                            <CalIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <Input
                                type="date" value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="h-9 pl-8 bg-muted/30 border-border w-44"
                                data-testid="orders-from-date"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                        <div className="relative">
                            <CalIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <Input
                                type="date" value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="h-9 pl-8 bg-muted/30 border-border w-44"
                                data-testid="orders-to-date"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-9 border-border" onClick={() => setRange(0)} data-testid="orders-range-today">Today</Button>
                    <Button size="sm" variant="outline" className="h-9 border-border" onClick={() => setRange(7)}>7 days</Button>
                    <Button size="sm" variant="outline" className="h-9 border-border" onClick={() => setRange(30)}>30 days</Button>
                    <Button size="sm" variant="outline" className="h-9 border-border" onClick={setThisMonth}>This month</Button>
                    {(fromDate || toDate) && (
                        <Button size="sm" variant="ghost" className="h-9 text-muted-foreground hover:text-destructive" onClick={clearRange} data-testid="orders-range-clear">
                            <XIcon size={13} /> Clear
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice / customer…" className="pl-10 h-10 bg-card border-border" data-testid="orders-search-input" />
                </div>
                <Tabs value={status} onValueChange={setStatus}>
                    <TabsList className="bg-muted/40 border border-border h-10">
                        {STATUSES.map((s) => (
                            <TabsTrigger key={s.v} value={s.v} data-testid={`orders-tab-${s.v}`} className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                                {s.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <div className="panel overflow-hidden">
                <div className="overflow-x-auto scroll-fade">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium">Invoice</th>
                                <th className="text-left px-3 py-3 font-medium">Date</th>
                                <th className="text-left px-3 py-3 font-medium">Customer</th>
                                <th className="text-left px-3 py-3 font-medium">Items</th>
                                <th className="text-left px-3 py-3 font-medium">Payment</th>
                                <th className="text-right px-3 py-3 font-medium">Total</th>
                                <th className="text-left px-3 py-3 font-medium">Status</th>
                                <th className="text-right px-5 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((o) => (
                                <tr key={o.id} className="border-t border-border hover:bg-muted/30" data-testid={`order-row-${o.invoice_no}`}>
                                    <td className="px-5 py-3 font-mono text-xs font-medium">{o.invoice_no}</td>
                                    <td className="px-3 py-3 text-muted-foreground">{fmtDate(o.created_at)}</td>
                                    <td className="px-3 py-3">
                                        <div className="font-medium flex items-center gap-1.5">
                                            {o.is_delivery && <Truck size={12} className="text-secondary" />}
                                            {o.customer_name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{o.customer_phone || "—"}</div>
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">{o.items.length} items</td>
                                    <td className="px-3 py-3 capitalize">{o.payment_method}{o.due_amount > 0 ? <span className="text-xs text-amber-400 ml-1">({fmtINR(o.due_amount)} due)</span> : null}</td>
                                    <td className="px-3 py-3 text-right font-medium">{fmtINR(o.total)}</td>
                                    <td className="px-3 py-3" data-testid="order-status-pill">
                                        <Badge variant="outline" className={`capitalize ${STATUS_STYLE[o.status] || ""}`}>{o.status}</Badge>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <div className="inline-flex gap-1">
                                            <Button size="sm" variant="ghost" className="gap-1" onClick={() => setOpenInvoice(o)} data-testid={`order-view-${o.invoice_no}`}>
                                                <FileText size={14} /> View
                                            </Button>
                                            {o.status === "pending" && (
                                                <Button size="sm" variant="ghost" className="gap-1 text-secondary" onClick={() => changeStatus(o, "dispatched")}>
                                                    Dispatch <ArrowRight size={12} />
                                                </Button>
                                            )}
                                            {o.status === "dispatched" && (
                                                <Button size="sm" variant="ghost" className="gap-1 text-primary" onClick={() => changeStatus(o, "completed")}>
                                                    Complete <ArrowRight size={12} />
                                                </Button>
                                            )}
                                            {o.status !== "cancelled" && o.status !== "completed" && (
                                                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={() => setCancelOrder(o)} data-testid={`order-cancel-${o.invoice_no}`}>
                                                    <XCircle size={14} /> Cancel
                                                </Button>
                                            )}
                                            {o.status === "completed" && (
                                                <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground hover:text-destructive" onClick={() => setCancelOrder(o)} data-testid={`order-cancel-${o.invoice_no}`}>
                                                    <XCircle size={14} /> Cancel
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {list.length === 0 && (
                                <tr><td colSpan={8} className="px-5 py-16 text-center text-muted-foreground">No orders found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <InvoiceModal order={openInvoice} onClose={() => setOpenInvoice(null)} />

            <Dialog open={!!cancelOrder} onOpenChange={(v) => !v && setCancelOrder(null)}>
                <DialogContent className="bg-card border-border" data-testid="cancel-order-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-heading flex items-center gap-2">
                            <XCircle size={18} className="text-destructive" />
                            Cancel order {cancelOrder?.invoice_no}
                        </DialogTitle>
                        <DialogDescription>
                            Stock for all line items will be restored. Revenue and analytics will exclude this order.
                            {cancelOrder?.due_amount > 0 && " Customer's outstanding balance will be reversed."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="rounded-md bg-muted/40 border border-border p-3 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{cancelOrder?.customer_name}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{cancelOrder?.items?.length}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{fmtINR(cancelOrder?.total || 0)}</span></div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Reason (optional)</Label>
                            <Textarea
                                rows={2}
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="e.g. Customer changed mind, pricing error…"
                                className="bg-muted/30 border-border"
                                data-testid="cancel-reason-input"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCancelOrder(null)}>Keep order</Button>
                        <Button
                            onClick={doCancel}
                            disabled={cancelling}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                            data-testid="cancel-confirm-btn"
                        >
                            <XCircle size={14} /> {cancelling ? "Cancelling…" : "Cancel order & restock"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
