import React, { useEffect, useMemo, useState } from "react";
import {
    Plus, CheckCircle2, Circle, Trash2, Calendar as CalIcon,
    ListTodo, Clock, User as UserIcon, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmtDate } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

const PRIORITY = {
    high: "bg-destructive/15 text-destructive border-destructive/40",
    normal: "bg-secondary/15 text-secondary border-secondary/40",
    low: "bg-muted/40 text-muted-foreground border-border",
};

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

export default function Tasks() {
    const { user } = useAuth();
    const [scope, setScope] = useState("today");
    const [statusFilter, setStatusFilter] = useState("all");
    const [list, setList] = useState([]);
    const [users, setUsers] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        title: "", description: "", priority: "normal",
        due_date: todayStr(), assigned_to: "self",
    });
    const [saving, setSaving] = useState(false);

    async function load() {
        const params = { scope };
        if (statusFilter !== "all") params.status_ = statusFilter;
        const { data } = await api.get("/tasks", { params });
        setList(data);
    }
    useEffect(() => {
        if (user?.role === "admin") {
            api.get("/users").then((r) => setUsers(r.data)).catch(() => setUsers([]));
        }
    }, [user]);
    useEffect(() => { load(); }, [scope, statusFilter]);

    const stats = useMemo(() => {
        const pending = list.filter((t) => t.status === "pending").length;
        const done = list.filter((t) => t.status === "done").length;
        const overdue = list.filter((t) => t.status === "pending" && t.due_date && t.due_date < todayStr()).length;
        return { pending, done, overdue };
    }, [list]);

    function openCreate() {
        setForm({ title: "", description: "", priority: "normal", due_date: todayStr(), assigned_to: "self" });
        setOpen(true);
    }

    async function save() {
        if (!form.title.trim()) return toast.error("Title required");
        setSaving(true);
        try {
            await api.post("/tasks", {
                title: form.title.trim(),
                description: form.description.trim(),
                priority: form.priority,
                due_date: form.due_date || null,
                assigned_to: form.assigned_to === "self" ? null : form.assigned_to,
            });
            toast.success("Task added");
            setOpen(false);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to add task");
        } finally {
            setSaving(false);
        }
    }

    async function toggle(t) {
        const next = t.status === "done" ? "pending" : "done";
        try {
            const { data } = await api.patch(`/tasks/${t.id}`, { status: next });
            setList((rows) => rows.map((r) => (r.id === t.id ? data : r)));
            if (next === "done") toast.success("Marked done");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Update failed");
        }
    }

    async function remove(t) {
        if (!confirm(`Delete task "${t.title}"?`)) return;
        try {
            await api.delete(`/tasks/${t.id}`);
            toast.success("Deleted");
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Delete failed");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Workflow</div>
                    <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Tasks for today</h1>
                    <p className="text-sm text-muted-foreground mt-1">Quick to-dos for the team. Tick to complete.</p>
                </div>
                <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20" data-testid="task-add-btn">
                    <Plus size={16} /> New Task
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="panel p-4">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</span><ListTodo size={14} className="text-primary" /></div>
                    <div className="font-heading text-2xl font-semibold mt-2" data-testid="task-stat-pending">{stats.pending}</div>
                </div>
                <div className="panel p-4">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</span><CheckCircle2 size={14} className="text-primary" /></div>
                    <div className="font-heading text-2xl font-semibold mt-2 text-primary" data-testid="task-stat-done">{stats.done}</div>
                </div>
                <div className="panel p-4">
                    <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue</span><AlertCircle size={14} className="text-destructive" /></div>
                    <div className="font-heading text-2xl font-semibold mt-2 text-destructive" data-testid="task-stat-overdue">{stats.overdue}</div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <Tabs value={scope} onValueChange={setScope} className="flex-1">
                    <TabsList className="bg-muted/40 border border-border h-10">
                        <TabsTrigger value="today" data-testid="task-tab-today">Today</TabsTrigger>
                        <TabsTrigger value="mine" data-testid="task-tab-mine">My tasks</TabsTrigger>
                        <TabsTrigger value="all" data-testid="task-tab-all">All</TabsTrigger>
                    </TabsList>
                </Tabs>
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                    <TabsList className="bg-muted/40 border border-border h-10">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                        <TabsTrigger value="done">Done</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="space-y-2.5">
                {list.map((t) => {
                    const overdue = t.status === "pending" && t.due_date && t.due_date < todayStr();
                    const done = t.status === "done";
                    return (
                        <div key={t.id} className={`panel p-4 flex items-start gap-3 transition-all ${done ? "opacity-60" : ""}`} data-testid={`task-row-${t.id}`}>
                            <button
                                onClick={() => toggle(t)}
                                className={`mt-0.5 shrink-0 ${done ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                                data-testid={`task-toggle-${t.id}`}
                                title={done ? "Mark as pending" : "Mark as done"}
                            >
                                {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className={`font-medium text-sm leading-tight ${done ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                                {t.description && (
                                    <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                                )}
                                <div className="flex flex-wrap items-center gap-3 mt-2.5">
                                    <Badge variant="outline" className={`capitalize ${PRIORITY[t.priority]}`}>{t.priority}</Badge>
                                    {t.due_date && (
                                        <span className={`text-xs flex items-center gap-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                                            <CalIcon size={11} />
                                            {t.due_date}{overdue && " · overdue"}
                                        </span>
                                    )}
                                    <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                        <UserIcon size={11} />{t.assigned_to_name}
                                    </span>
                                    {t.created_by !== t.assigned_to && (
                                        <span className="text-xs text-muted-foreground">by {t.created_by_name}</span>
                                    )}
                                    {done && t.completed_at && (
                                        <span className="text-xs text-primary flex items-center gap-1">
                                            <Clock size={11} /> done {fmtDate(t.completed_at)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {(t.created_by === user?.id || user?.role === "admin") && (
                                <button onClick={() => remove(t)} className="text-muted-foreground hover:text-destructive shrink-0" data-testid={`task-delete-${t.id}`}>
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                    );
                })}
                {list.length === 0 && (
                    <div className="panel p-12 text-center text-muted-foreground">
                        <ListTodo size={32} className="mx-auto mb-3 opacity-40" />
                        <div className="font-medium text-sm">All caught up</div>
                        <div className="text-xs mt-1">No tasks in this view. Add your first task above.</div>
                    </div>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border max-w-lg" data-testid="task-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-heading">New task</DialogTitle>
                        <DialogDescription>Quick to-do for you or a teammate.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Title</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                placeholder="e.g. Restock CPVC pipes from Supreme"
                                className="bg-muted/30 border-border"
                                data-testid="task-form-title"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Description</Label>
                            <Textarea
                                rows={2}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Optional details…"
                                className="bg-muted/30 border-border"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Priority</Label>
                                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                                    <SelectTrigger className="bg-muted/30 border-border" data-testid="task-form-priority"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-popover border-border">
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Due date</Label>
                                <Input
                                    type="date"
                                    value={form.due_date || ""}
                                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                                    className="bg-muted/30 border-border"
                                    data-testid="task-form-duedate"
                                />
                            </div>
                        </div>
                        {user?.role === "admin" && users.length > 0 && (
                            <div className="space-y-1.5">
                                <Label>Assign to</Label>
                                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                                    <SelectTrigger className="bg-muted/30 border-border"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-popover border-border">
                                        <SelectItem value="self">Myself</SelectItem>
                                        {users.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name} · {u.role}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="task-form-save-btn">
                            {saving ? "Saving…" : "Add task"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
