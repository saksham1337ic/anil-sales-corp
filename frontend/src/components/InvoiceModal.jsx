import React from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, X } from "lucide-react";
import { fmtINR, fmtDate, API_BASE, tokenStore } from "@/lib/api";

const COMPANY = {
    name: "Anil Sales Corporation",
    tagline: "Sanitary & Plumbing Products",
    address: "9 - Cannaught Circus, Hind Samachar Ground, Jalandhar - 144001",
    phone_office: "0181 2282465",
    mobile_1: "7696057000",
    mobile_2: "7696028000",
    email: "vivek.anilsales@gmail.com",
    gstin: "03AADFA7788E1ZI",
    pan: "AADFA7788E",
    udyam: "UDYAM-PB-10-0020522",
};

export default function InvoiceModal({ order, onClose }) {
    if (!order) return null;
    const token = tokenStore.get();
    const pdfUrl = `${API_BASE}/orders/${order.id}/invoice.pdf?token=${encodeURIComponent(token || "")}`;

    function handlePrint() {
        window.open(pdfUrl, "_blank");
    }

    return (
        <Dialog open={!!order} onOpenChange={(v) => !v && onClose?.()}>
            <DialogContent className="bg-card border-border max-w-3xl p-0 overflow-hidden" data-testid="invoice-modal">
                <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0 no-print">
                    <DialogTitle className="font-heading text-base flex items-center gap-2">
                        Invoice <span className="font-mono text-primary">{order.invoice_no}</span>
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} data-testid="invoice-print-btn">
                            <Printer size={14} /> Print
                        </Button>
                        <a href={pdfUrl} download={`${order.invoice_no}.pdf`}>
                            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" data-testid="invoice-pdf-btn">
                                <Download size={14} /> PDF
                            </Button>
                        </a>
                    </div>
                </DialogHeader>

                <div className="bg-white text-slate-900 p-8 max-h-[70vh] overflow-auto scroll-fade">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b-2 border-emerald-600 pb-5">
                        <div>
                            <div className="text-2xl font-bold tracking-tight">{COMPANY.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{COMPANY.tagline}</div>
                            <div className="text-xs text-slate-600 mt-2 leading-relaxed">{COMPANY.address}</div>
                            <div className="text-xs text-slate-600">Office: {COMPANY.phone_office} • Mobile: {COMPANY.mobile_1}, {COMPANY.mobile_2}</div>
                            <div className="text-xs text-slate-600">Email: {COMPANY.email}</div>
                            <div className="text-xs text-slate-600 mt-1">
                                <span className="font-mono">GSTIN: {COMPANY.gstin}</span>
                                <span className="mx-2 text-slate-300">·</span>
                                <span className="font-mono">PAN: {COMPANY.pan}</span>
                                <span className="mx-2 text-slate-300">·</span>
                                <span className="font-mono">{COMPANY.udyam}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-emerald-600 tracking-tight">INVOICE</div>
                            <div className="font-mono text-sm mt-1">{order.invoice_no}</div>
                            <div className="text-xs text-slate-500 mt-1">{fmtDate(order.created_at)}</div>
                        </div>
                    </div>

                    {/* Bill to */}
                    <div className="grid grid-cols-2 gap-6 mt-6">
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Bill To</div>
                            <div className="text-base font-medium mt-1">{order.customer_name}</div>
                            <div className="text-sm text-slate-600">{order.customer_phone || "—"}</div>
                            {order.is_delivery && order.delivery_address && (
                                <div className="mt-3">
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Delivery Address</div>
                                    <div className="text-sm text-slate-700 mt-1 leading-relaxed whitespace-pre-line">{order.delivery_address}</div>
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Payment</div>
                            <div className="text-sm font-medium uppercase mt-1">{order.payment_method}</div>
                            <Badge className={
                                order.status === "completed"
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                    : order.status === "pending"
                                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                                    : order.status === "cancelled"
                                    ? "bg-rose-100 text-rose-700 border border-rose-200"
                                    : "bg-slate-100 text-slate-700 border border-slate-200"
                            }>
                                {order.status}
                            </Badge>
                            {order.is_delivery && (
                                <div className="mt-3">
                                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-1 rounded">
                                        Delivery Order
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Items */}
                    <table className="w-full mt-6 text-sm">
                        <thead className="bg-slate-900 text-white">
                            <tr>
                                <th className="text-left px-3 py-2.5 font-medium">#</th>
                                <th className="text-left px-3 py-2.5 font-medium">Item</th>
                                <th className="text-left px-3 py-2.5 font-medium">SKU</th>
                                <th className="text-right px-3 py-2.5 font-medium">Qty</th>
                                <th className="text-right px-3 py-2.5 font-medium">Rate</th>
                                <th className="text-right px-3 py-2.5 font-medium">Disc</th>
                                <th className="text-right px-3 py-2.5 font-medium">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((it, i) => (
                                <tr key={i} className="border-b border-slate-100">
                                    <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                                    <td className="px-3 py-2.5">{it.name}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{it.sku}</td>
                                    <td className="px-3 py-2.5 text-right">{it.quantity}</td>
                                    <td className="px-3 py-2.5 text-right">{fmtINR(it.price)}</td>
                                    <td className="px-3 py-2.5 text-right text-slate-500">{fmtINR(it.discount)}</td>
                                    <td className="px-3 py-2.5 text-right font-medium">{fmtINR(it.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div className="flex justify-end mt-4">
                        <div className="w-72 space-y-1 text-sm">
                            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtINR(order.subtotal)}</span></div>
                            <div className="flex justify-between text-slate-600"><span>Discount ({order.discount_type})</span><span>-{fmtINR(order.discount_amount)}</span></div>
                            <div className="flex justify-between text-slate-600"><span>Tax</span><span>{fmtINR(order.tax)}</span></div>
                            {order.is_delivery && order.delivery_charges > 0 && (
                                <div className="flex justify-between text-sky-700"><span>Delivery charges</span><span>{fmtINR(order.delivery_charges)}</span></div>
                            )}
                            {order.is_labour && order.labour_charges > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <span>Labour{order.labour_description ? ` (${order.labour_description})` : ""}</span>
                                    <span>{fmtINR(order.labour_charges)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-semibold text-lg pt-2 border-t border-slate-200 text-emerald-700">
                                <span>TOTAL</span><span>{fmtINR(order.total)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 pt-1"><span>Paid</span><span>{fmtINR(order.paid_amount)}</span></div>
                            {order.due_amount > 0 && (
                                <div className="flex justify-between font-medium text-amber-700"><span>Due</span><span>{fmtINR(order.due_amount)}</span></div>
                            )}
                        </div>
                    </div>

                    {order.notes && (
                        <div className="mt-6 text-sm text-slate-600">
                            <span className="font-medium">Notes: </span>{order.notes}
                        </div>
                    )}
                    <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
                        Thank you for your business · Computer-generated invoice, no signature required.
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
