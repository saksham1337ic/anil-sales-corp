import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    TrendingUp, ShoppingCart, AlertTriangle, IndianRupee,
    Package, ArrowUpRight, Receipt, PlusCircle, Sparkles,
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api, fmtINR, fmtDay } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";

function KpiCard({ icon: Icon, label, value, sub, accent = "primary", testid }) {
    return (
        <div className="panel p-5 hover:border-primary/40 transition-colors" data-testid={testid}>
            <div className="flex items-start justify-between">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center bg-${accent}/15 text-${accent} border border-${accent}/30`}>
                    <Icon size={18} strokeWidth={1.75} />
                </div>
                <ArrowUpRight size={16} className="text-muted-foreground" />
            </div>
            <div className="mt-5">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                <div className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{value}</div>
                {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { user } = useAuth();
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get("/dashboard/summary").then((r) => setData(r.data));
    }, []);

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80 flex items-center gap-1.5">
                        <Sparkles size={12} /> Workspace · {new Date().toLocaleDateString("en-IN", { weekday: "long" })}
                    </div>
                    <h1 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight mt-1">
                        Welcome back, <span className="text-primary">{user?.name?.split(" ")[0]}</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Here is your real-time business pulse for Anil Sales Corporation.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link to="/pos">
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20" data-testid="dashboard-pos-btn">
                            <ShoppingCart size={16} /> New Sale
                        </Button>
                    </Link>
                    <Link to="/products">
                        <Button variant="outline" className="gap-2 border-border" data-testid="dashboard-products-btn">
                            <PlusCircle size={16} /> Products
                        </Button>
                    </Link>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 stagger">
                <KpiCard
                    icon={IndianRupee} label="Today's Revenue"
                    value={data ? fmtINR(data.today_revenue) : "—"}
                    sub="Sales recorded today"
                    testid="dashboard-kpi-revenue"
                />
                <KpiCard
                    icon={TrendingUp} label="Total Revenue"
                    value={data ? fmtINR(data.total_revenue) : "—"}
                    sub={`${data?.total_orders ?? 0} orders all-time`}
                    accent="secondary"
                    testid="dashboard-kpi-total"
                />
                <KpiCard
                    icon={AlertTriangle} label="Low Stock"
                    value={data?.low_stock_count ?? "—"}
                    sub="Items at or below threshold"
                    accent="destructive"
                    testid="dashboard-kpi-lowstock"
                />
                <KpiCard
                    icon={Receipt} label="Pending Orders"
                    value={data?.pending_orders ?? "—"}
                    sub={`Outstanding ${data ? fmtINR(data.total_outstanding) : "—"}`}
                    accent="primary"
                    testid="dashboard-kpi-pending"
                />
            </div>

            {/* Sales trend + low stock */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="panel p-6 lg:col-span-2" data-testid="dashboard-sales-chart">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Sales Trend</div>
                            <h3 className="font-heading text-lg font-medium mt-1">Revenue · last 14 days</h3>
                        </div>
                        <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10">Live</Badge>
                    </div>
                    <div className="h-72">
                        {data && (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.sales_trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.5} />
                                            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                                        labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                                        formatter={(v) => [fmtINR(v), "Revenue"]}
                                        labelFormatter={fmtDay}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#rev)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="panel p-6" data-testid="dashboard-lowstock-list">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Stock Alerts</div>
                            <h3 className="font-heading text-lg font-medium mt-1">Low Inventory</h3>
                        </div>
                        <AlertTriangle size={16} className="text-destructive" />
                    </div>
                    <div className="space-y-3 max-h-72 overflow-auto scroll-fade pr-1">
                        {(data?.low_stock_items ?? []).slice(0, 8).map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                                <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">{p.name}</div>
                                    <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                                </div>
                                <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40 shrink-0">
                                    {p.stock} {p.unit}
                                </Badge>
                            </div>
                        ))}
                        {data?.low_stock_items?.length === 0 && (
                            <div className="text-sm text-muted-foreground text-center py-10 flex flex-col items-center gap-2">
                                <Package size={28} className="opacity-40" />
                                Stock levels healthy
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
