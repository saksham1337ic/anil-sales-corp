import React, { useEffect, useState } from "react";
import { Search, FileText, IndianRupee, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api, fmtINR, fmtDate } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    const [openInvoice, setOpenInvoice] = useState(null);

    async function load() {
        const params = {};
        if (q) params.q = q;
        if (status !== "all") params.status_ = status;
        const { data } = await api.get("/orders", { params });
        setList(data);
    }
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, status]);

    async function changeStatus(o, next) {
        try {
            const { data } = await api.patch(`/orders/${o.id}/status`, { status: next });
            toast.success(`Marked ${next}`);
            setList((rows) => rows.map((r) => (r.id === o.id ? data : r)));
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Update failed");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Sales</div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Orders & Invoices</h1>
                    <p className="text-sm text-muted-foreground mt-1">{list.length} records</p>
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
                                        <div className="font-medium">{o.customer_name}</div>
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
        </div>
    );
}
