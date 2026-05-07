import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";
import Orders from "@/pages/Orders";
import Analytics from "@/pages/Analytics";
import Tasks from "@/pages/Tasks";
import AuditLogs from "@/pages/AuditLogs";
import Layout from "@/components/Layout";
import "@/App.css";

function Protected({ children, adminOnly = false }) {
    const { user, bootChecked } = useAuth();
    if (!bootChecked) {
        return (
            <div className="min-h-screen flex items-center justify-center text-muted-foreground">
                <div className="animate-pulse text-sm tracking-widest">LOADING…</div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
    return children;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
                element={
                    <Protected>
                        <Layout />
                    </Protected>
                }
            >
                <Route path="/" element={<Dashboard />} />
                <Route path="/pos" element={<POS />} />
                <Route path="/products" element={<Products />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route
                    path="/analytics"
                    element={
                        <Protected adminOnly>
                            <Analytics />
                        </Protected>
                    }
                />
                <Route
                    path="/logs"
                    element={
                        <Protected adminOnly>
                            <AuditLogs />
                        </Protected>
                    }
                />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
                <Toaster
                    theme="dark"
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: "hsl(240 10% 6%)",
                            color: "hsl(0 0% 98%)",
                            border: "1px solid hsl(240 6% 14%)",
                        },
                    }}
                />
            </BrowserRouter>
        </AuthProvider>
    );
}
