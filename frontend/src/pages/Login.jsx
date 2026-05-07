import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Wrench, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function Login() {
    const { login, user, bootChecked } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("admin@anilsales.com");
    const [password, setPassword] = useState("Admin@123");
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    if (bootChecked && user) return <Navigate to="/" replace />;

    async function onSubmit(e) {
        e.preventDefault();
        setErr("");
        setLoading(true);
        const res = await login(email.trim().toLowerCase(), password);
        setLoading(false);
        if (res.ok) {
            toast.success("Welcome back");
            navigate("/");
        } else {
            setErr(res.error);
            toast.error(res.error || "Login failed");
        }
    }

    return (
        <div className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden">
            {/* Background image */}
            <div
                className="absolute inset-0 bg-cover bg-center opacity-50"
                style={{
                    backgroundImage:
                        "url('https://images.unsplash.com/photo-1770745559994-545619d3c3da?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGRhcmslMjBsdXh1cnklMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3ODEyNTYwMXww&ixlib=rb-4.1.0&q=85')",
                }}
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-background via-background/90 to-transparent" />
            <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-secondary/10 blur-3xl" />

            <div className="relative w-full max-w-md grain">
                <div className="glass rounded-2xl p-8 lg:p-10 shadow-2xl shadow-black/40 animate-in-up">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
                            <Wrench size={20} className="text-primary-foreground" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Welcome to</div>
                            <div className="font-heading text-xl font-semibold tracking-tight">Anil Sales Corporation</div>
                        </div>
                    </div>

                    <h1 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight mb-2 text-balance">
                        Sign in to your <span className="text-primary">workspace</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                        Inventory & Point of Sale. Premium tooling for sanitary & plumbing retail.
                    </p>

                    <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@anilsales.com"
                                className="h-11 bg-muted/40 border-border focus-visible:ring-primary/60"
                                data-testid="login-email-input"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPwd ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="h-11 bg-muted/40 border-border pr-11 focus-visible:ring-primary/60"
                                    data-testid="login-password-input"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPwd((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    data-testid="login-toggle-pwd"
                                >
                                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {err && (
                            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2" data-testid="login-error">
                                {err}
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
                            data-testid="login-submit-button"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                            {loading ? "Signing in" : "Sign in"}
                        </Button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between"><span>Admin demo</span><span className="font-mono">admin@anilsales.com / Admin@123</span></div>
                        <div className="flex justify-between"><span>Staff demo</span><span className="font-mono">staff@anilsales.com / Staff@123</span></div>
                    </div>
                </div>

                <div className="mt-6 text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Anil Sales Corporation · All rights reserved
                </div>
            </div>
        </div>
    );
}
