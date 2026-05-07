import React, { useEffect, useMemo, useState } from "react";
import {
    Search, Filter, Activity, User as UserIcon, Package, Receipt,
    ShoppingCart, ListTodo, ShieldCheck, AlertCircle, RefreshCcw,
} from "lucide-react";
import { api, fmtDate } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

const ENTITY_ICON = {
    user: UserIcon, product: Package, customer: UserIcon,
    order: Receipt, task: ListTodo,
};

const ACTION_STYLE = {
    "auth.login": "bg-primary/15 text-primary border-primary/30",
    "auth.login_failed": "bg-destructive/15 text-destructive border-destructive/40",
    "auth.logout": "bg-muted/40 text-muted-foreground border-border",
    "product.create": "bg-primary/15 text-primary border-primary/30",
    "product.update": "bg-secondary/15 text-secondary border-secondary/40",
    "product.delete": "bg-destructive/15 text-destructive border-destructive/40",
    "product.adjust_stock": "bg-amber-500/15 text-amber-400 border-amber-500/30",
    "customer.create": "bg-primary/15 text-primary border-primary/30",
    "customer.update": "bg-secondary/15 text-secondary border-secondary/40",
    "customer.delete": "bg-destructive/15 text-destructive border-destructive/40",
    "order.create": "bg-primary/15 text-primary border-primary/30",
    "order.status_change": "bg-secondary/15 text-secondary border-secondary/40",
    "order.payment": "bg-primary/15 text-primary border-primary/30",
    "order.cancel": "bg-destructive/15 text-destructive border-destructive/40",
    "task.create": "bg-secondary/15 text-secondary border-secondary/40",
    "task.toggle": "bg-primary/15 text-primary border-primary/30",
    "task.update": "bg-muted/40 text-muted-foreground border-border",
    "task.delete": "bg-destructive/15 text-destructive border-destructive/40",
};

export default function AuditLogs() {
    const [list, setList] = useState([]);
    const [stats, setStats] = useState(null);
    const [days, setDays] = useState(7);
    const [entityType, setEntityType] = useState("all");
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const params = { days, limit: 500 };
            if (entityType !== "all") params.entity_type = entityType;
            if (q) params.q = q;
            const [{ data: rows }, { data: s }] = await Promise.all([
                api.get("/audit-logs", { params }),
                api.get("/audit-logs/stats", { params: { days } }),
            ]);
            setList(rows);
            setStats(s);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [days, entityType, q]);

    const grouped = useMemo(() => {
        const groups = new Map();
        list.forEach((r) => {
            const day = r.created_at?.slice(0, 10) || "—";
            if (!groups.has(day)) groups.set(day, []);
            groups.get(day).push(r);
        });
        return Array.from(groups.entries());
    }, [list]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-1.5">
                        <ShieldCheck size={12} className="text-primary" /> Audit
                    </div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Activity logs</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Every login, sale, edit, cancellation and stock change — all in one timeline.
                    </p>
                </div>
                <Button variant="outline" onClick={load} disabled={loading} className="gap-2 border-border" data-testid="logs-refresh-btn">
                    <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Refresh
                </Button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="panel p-4">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total events</div>
                        <div className="font-heading text-2xl font-semibold mt-1.5" data-testid="logs-stat-total">{stats.total}</div>
                    </div>
                    {stats.by_action.slice(0, 4).map((r) => (
                        <div key={r.action} className="panel p-4">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate" title={r.action}>{r.action}</div>
                            <div className="font-heading text-2xl font-semibold mt-1.5">{r.count}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by action, user, summary…"
                        className="pl-10 h-10 bg-card border-border"
                        data-testid="logs-search-input"
                    />
                </div>
                <Select value={entityType} onValueChange={setEntityType}>
                    <SelectTrigger className="w-full sm:w-44 h-10 bg-card border-border" data-testid="logs-entity-filter">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                        <SelectItem value="all">All entities</SelectItem>
                        <SelectItem value="user">Users / Auth</SelectItem>
                        <SelectItem value="product">Products</SelectItem>
                        <SelectItem value="customer">Customers</SelectItem>
                        <SelectItem value="order">Orders</SelectItem>
                        <SelectItem value="task">Tasks</SelectItem>
                    </SelectContent>
                </Select>
                <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                    <TabsList className="bg-muted/40 border border-border h-10">
                        <TabsTrigger value="1">1d</TabsTrigger>
                        <TabsTrigger value="7">7d</TabsTrigger>
                        <TabsTrigger value="30">30d</TabsTrigger>
                        <TabsTrigger value="90">90d</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Timeline */}
            {list.length === 0 ? (
                <div className="panel p-12 text-center text-muted-foreground">
                    <Activity size={32} className="mx-auto mb-3 opacity-40" />
                    <div className="font-medium text-sm">No activity in this window</div>
                    <div className="text-xs mt-1">Try widening the date range or clearing filters.</div>
                </div>
            ) : (
                <div className="space-y-6">
                    {grouped.map(([day, rows]) => (
                        <div key={day}>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-1 mb-3">{day}</div>
                            <div className="panel divide-y divide-border overflow-hidden">
                                {rows.map((r) => {
                                    const Icon = ENTITY_ICON[r.entity_type] || Activity;
                                    return (
                                        <div key={r.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors" data-testid={`log-row-${r.id}`}>
                                            <div className="h-8 w-8 rounded-full bg-muted/50 border border-border flex items-center justify-center shrink-0 mt-0.5">
                                                <Icon size={13} className="text-muted-foreground" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline" className={`font-mono text-[10px] ${ACTION_STYLE[r.action] || "bg-muted/40 text-muted-foreground border-border"}`}>
                                                        {r.action}
                                                    </Badge>
                                                    <span className="text-sm font-medium truncate">{r.summary || r.entity_id}</span>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                                                    <span>{r.user_name || "system"}</span>
                                                    {r.user_role && <span className="text-[10px] uppercase tracking-wider">· {r.user_role}</span>}
                                                    <span>·</span>
                                                    <span>{fmtDate(r.created_at)}</span>
                                                    {r.metadata && Object.keys(r.metadata).length > 0 && (
                                                        <span className="font-mono text-[10px] text-muted-foreground/80 truncate max-w-md">
                                                            · {Object.entries(r.metadata).slice(0, 3).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
