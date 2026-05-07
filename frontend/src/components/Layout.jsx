import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
    LayoutDashboard, ShoppingCart, Boxes, Users, Receipt,
    BarChart3, LogOut, Search, Bell, Sun, Moon, Menu, X, Wrench, ListTodo, Activity,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const NAV = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
    { to: "/pos", label: "Point of Sale", icon: ShoppingCart, testid: "nav-pos" },
    { to: "/products", label: "Products", icon: Boxes, testid: "nav-products" },
    { to: "/customers", label: "Customers", icon: Users, testid: "nav-customers" },
    { to: "/orders", label: "Orders", icon: Receipt, testid: "nav-orders" },
    { to: "/tasks", label: "Tasks", icon: ListTodo, testid: "nav-tasks" },
    { to: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true, testid: "nav-analytics" },
    { to: "/logs", label: "Activity Logs", icon: Activity, adminOnly: true, testid: "nav-logs" },
];

function useTheme() {
    const [dark, setDark] = useState(() =>
        document.documentElement.classList.contains("dark")
    );
    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
    };
    return { dark, toggle };
}

export default function Layout() {
    const { user, logout } = useAuth();
    const { dark, toggle } = useTheme();
    const navigate = useNavigate();
    const loc = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");

    return (
        <div className="min-h-screen flex bg-background text-foreground">
            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky top-0 z-40 h-screen w-72 shrink-0 bg-card/60 backdrop-blur-xl border-r border-border transition-transform duration-300 ${
                    mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                }`}
                data-testid="app-sidebar"
            >
                <div className="h-16 flex items-center justify-between px-5 border-b border-border">
                    <div className="flex items-center gap-2.5">
                        <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                            <Wrench className="h-4.5 w-4.5 text-primary-foreground" size={18} />
                        </div>
                        <div className="leading-tight">
                            <div className="font-heading font-semibold text-sm tracking-tight">Anil Sales Corp.</div>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Inventory · POS</div>
                        </div>
                    </div>
                    <button
                        className="lg:hidden text-muted-foreground hover:text-foreground"
                        onClick={() => setMobileOpen(false)}
                        data-testid="sidebar-close-btn"
                    >
                        <X size={18} />
                    </button>
                </div>

                <nav className="px-3 py-5 space-y-1">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground px-3 mb-2">Workspace</div>
                    {items.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.to === "/"}
                            data-testid={n.testid}
                            className={({ isActive }) =>
                                `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    isActive
                                        ? "bg-primary/15 text-primary border border-primary/30 shadow-[inset_0_0_24px_-12px] shadow-primary/40"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                }`
                            }
                            onClick={() => setMobileOpen(false)}
                        >
                            <n.icon size={18} strokeWidth={1.75} />
                            <span>{n.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        <Avatar className="h-9 w-9 border border-border">
                            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-secondary/30 text-primary-foreground font-semibold text-xs">
                                {(user?.name || "U")[0].toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate" data-testid="sidebar-user-name">{user?.name}</div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{user?.role}</div>
                        </div>
                        <button
                            onClick={logout}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Logout"
                            data-testid="sidebar-logout-btn"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Topbar */}
                <header className="sticky top-0 z-30 h-16 px-4 lg:px-8 flex items-center justify-between bg-background/70 backdrop-blur-xl border-b border-border">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                            className="lg:hidden text-muted-foreground hover:text-foreground"
                            onClick={() => setMobileOpen(true)}
                            data-testid="sidebar-open-btn"
                        >
                            <Menu size={20} />
                        </button>
                        <div className="relative max-w-md flex-1 hidden sm:block">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search products, invoices, customers…"
                                className="pl-9 h-10 bg-muted/40 border-border focus-visible:ring-primary/50"
                                data-testid="topbar-search-input"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                        navigate(`/products?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
                                    }
                                }}
                            />
                            <span className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 kbd">⏎</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={toggle}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid="theme-toggle-btn"
                            title="Toggle theme"
                        >
                            {dark ? <Sun size={18} /> : <Moon size={18} />}
                        </Button>
                        <Button size="icon" variant="ghost" className="text-muted-foreground" data-testid="notifications-btn">
                            <Bell size={18} />
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-muted/40 border border-border hover:border-primary/40 transition-colors" data-testid="topbar-user-menu">
                                    <Avatar className="h-7 w-7">
                                        <AvatarFallback className="bg-gradient-to-br from-primary/30 to-secondary/30 text-xs font-semibold">
                                            {(user?.name || "U")[0].toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium hidden md:inline">{user?.name?.split(" ")[0]}</span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
                                <DropdownMenuLabel>
                                    <div className="text-sm font-medium">{user?.name}</div>
                                    <div className="text-xs text-muted-foreground">{user?.email}</div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive" data-testid="menu-logout-btn">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 animate-in-up" key={loc.pathname}>
                    <Outlet />
                </main>
            </div>

            {mobileOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}
        </div>
    );
}
