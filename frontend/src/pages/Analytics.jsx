import React, { useEffect, useState } from "react";
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, ShoppingBag, CreditCard, Boxes } from "lucide-react";
import { api, fmtINR, fmtDay } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const COLORS = [
    "hsl(var(--chart-1))", "hsl(var(--chart-2))",
    "hsl(var(--chart-3))", "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
];

export default function Analytics() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get("/analytics/overview", { params: { days } }).then((r) => setData(r.data));
    }, [days]);

    return (
        <div className="space-y-7">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Insights</div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Analytics</h1>
                    <p className="text-sm text-muted-foreground mt-1">Sales, products, payment & people · admin only</p>
                </div>
                <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                    <TabsList className="bg-muted/40 border border-border h-10">
                        <TabsTrigger value="7">7d</TabsTrigger>
                        <TabsTrigger value="30">30d</TabsTrigger>
                        <TabsTrigger value="90">90d</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 stagger">
                <div className="panel p-5">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</span><TrendingUp size={14} className="text-primary" /></div>
                    <div className="font-heading text-2xl font-semibold mt-3">{data ? fmtINR(data.total_revenue) : "—"}</div>
                </div>
                <div className="panel p-5">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Orders</span><ShoppingBag size={14} className="text-secondary" /></div>
                    <div className="font-heading text-2xl font-semibold mt-3">{data?.total_orders ?? "—"}</div>
                </div>
                <div className="panel p-5">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg. Order</span><CreditCard size={14} className="text-amber-400" /></div>
                    <div className="font-heading text-2xl font-semibold mt-3">{data && data.total_orders ? fmtINR(data.total_revenue / data.total_orders) : "—"}</div>
                </div>
                <div className="panel p-5">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Categories</span><Boxes size={14} className="text-primary" /></div>
                    <div className="font-heading text-2xl font-semibold mt-3">{data?.category_breakdown?.length ?? "—"}</div>
                </div>
            </div>

            {/* Revenue trend */}
            <div className="panel p-6" data-testid="analytics-revenue-chart">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Trend</div>
                        <h3 className="font-heading text-lg font-medium mt-1">Daily revenue · last {days} days</h3>
                    </div>
                    <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Live</Badge>
                </div>
                <div className="h-72">
                    {data && (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.revenue_trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.5} />
                                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtINR(v)} labelFormatter={fmtDay} />
                                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#rev2)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Top products */}
                <div className="panel p-6">
                    <h3 className="font-heading text-lg font-medium mb-5">Top products</h3>
                    <div className="h-72">
                        {data && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.top_products} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
                                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtINR(v)} />
                                    <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Payment breakdown donut */}
                <div className="panel p-6">
                    <h3 className="font-heading text-lg font-medium mb-5">Payment methods</h3>
                    <div className="h-72">
                        {data && (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.payment_breakdown} dataKey="value" nameKey="method" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="hsl(var(--card))">
                                        {data.payment_breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtINR(v)} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Categories */}
                <div className="panel p-6">
                    <h3 className="font-heading text-lg font-medium mb-5">Category performance</h3>
                    <div className="h-72">
                        {data && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.category_breakdown} margin={{ top: 0, right: 10, left: -10, bottom: 30 }}>
                                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" />
                                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtINR(v)} />
                                    <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Employee performance */}
                <div className="panel p-6">
                    <h3 className="font-heading text-lg font-medium mb-5">Employee performance</h3>
                    <div className="space-y-3">
                        {(data?.employee_performance || []).map((e, i) => (
                            <div key={e.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-xs font-semibold">{e.name[0]?.toUpperCase()}</div>
                                    <div>
                                        <div className="font-medium text-sm">{e.name}</div>
                                        <div className="text-xs text-muted-foreground">{e.orders} orders</div>
                                    </div>
                                </div>
                                <div className="font-heading font-semibold text-sm text-primary">{fmtINR(e.revenue)}</div>
                            </div>
                        ))}
                        {(!data?.employee_performance || data.employee_performance.length === 0) && (
                            <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
