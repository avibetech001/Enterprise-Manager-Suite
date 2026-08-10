import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useCreateInvoice,
  useUpdateInvoiceStatus,
  useSendInvoiceReceipt,
  useDeleteInvoice,
  getListInvoicesQueryKey,
  Invoice,
  InvoiceItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Plus, Mail, Download, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import logoUrl from "@/assets/invoice-logo.png";
import notoRegularUrl from "@/assets/NotoSans-Regular.ttf";
import notoBoldUrl from "@/assets/NotoSans-Bold.ttf";

// ---------------------------------------------------------------------------
// Company letterhead details (from the official invoice template)
// ---------------------------------------------------------------------------
const COMPANY = {
  name: "5TH ELEMENT MEDIA GROUP",
  tin: "TIN: 23952683-0001",
  addressLines: [
    "SUITE C6, SANCTUARY CORT,",
    "HORTIGRAPH ESTATE,",
    "KARIMO, ABUJA",
    "FEDERAL CAPITAL TERRITORY",
  ],
  bankAccountName: "5th Element Marketing & Media Ltd",
  bankAccountNumber: "1849685317",
  bankName: "Access Bank",
};

const NAIRA = "\u20A6";

function fmtMoney(n: number): string {
  return (
    NAIRA +
    n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`;
}

function lineNet(it: InvoiceItem): number {
  return it.quantity * it.rate * (1 - it.discountPct / 100);
}

// Totals for a saved invoice. Older invoices (created before line items
// existed) have no items — fall back to the stored amount.
function invoiceTotals(invoice: Invoice) {
  if (invoice.items.length === 0) {
    const amt = Number(invoice.amount) || 0;
    return { net: amt, vat: 0, total: amt };
  }
  return computeTotals(invoice.items);
}

function computeTotals(items: InvoiceItem[]) {
  let net = 0;
  let vat = 0;
  for (const it of items) {
    const n = lineNet(it);
    net += n;
    vat += (n * it.vatPct) / 100;
  }
  return { net, vat, total: net + vat };
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  const map: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${day}${map[day % 10] || "th"}`;
}

function fmtLongDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-GB", { month: "long" });
  return `${ordinal(d.getDate())} ${month}, ${d.getFullYear()}`;
}

function itemsSummary(items: InvoiceItem[]): string {
  if (items.length === 0) return "";
  const first = items[0].description.split("\n")[0];
  return items.length > 1 ? `${first} (+${items.length - 1} more)` : first;
}

// ---------------------------------------------------------------------------
// PDF generation (matches the printed letterhead layout)
// ---------------------------------------------------------------------------
let pdfAssets: { regular: string; bold: string; logo: string } | null = null;

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load asset: ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Failed to read asset"));
    r.readAsDataURL(blob);
  });
}

async function loadPdfAssets() {
  if (pdfAssets) return pdfAssets;
  const [regular, bold, logo] = await Promise.all([
    urlToDataUrl(notoRegularUrl),
    urlToDataUrl(notoBoldUrl),
    urlToDataUrl(logoUrl),
  ]);
  pdfAssets = {
    regular: regular.split(",")[1],
    bold: bold.split(",")[1],
    logo,
  };
  return pdfAssets;
}

async function downloadInvoicePdf(invoice: Invoice) {
  const assets = await loadPdfAssets();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", assets.regular);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", assets.bold);
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const right = pageWidth - margin;
  const totals = invoiceTotals(invoice);

  // Header: INVOICE + meta (left), logo (right)
  let y = 58;
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(invoice.status === "paid" ? "INVOICE (PAID)" : "INVOICE", margin, y);

  // Logo — keep aspect ratio (688 x 240 source)
  const logoW = 150;
  const logoH = (240 / 688) * logoW;
  doc.addImage(assets.logo, "PNG", right - logoW, 40, logoW, logoH);

  y += 20;
  doc.setFontSize(9);
  const meta: Array<[string, string]> = [
    ["NUMBER:", invoice.invoiceNumber],
    ["DATE:", fmtLongDate(invoice.createdAt)],
    ...(invoice.paidAt
      ? ([["PAID:", fmtLongDate(invoice.paidAt)]] as Array<[string, string]>)
      : []),
  ];
  for (const [k, v] of meta) {
    doc.setFont("NotoSans", "normal");
    doc.setTextColor(110);
    doc.text(k, margin, y);
    doc.setFont("NotoSans", "bold");
    doc.setTextColor(20);
    doc.text(v, margin + 110, y);
    y += 13;
  }

  // FROM / TO
  y = Math.max(y + 24, 150);
  const colTo = pageWidth / 2 + 20;
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("FROM", margin, y);
  doc.text("TO", colTo, y);
  y += 15;
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(COMPANY.name, margin, y);
  const clientNameLines = doc.splitTextToSize(
    invoice.clientName.toUpperCase(),
    right - colTo,
  );
  doc.text(clientNameLines, colTo, y);
  y += 14;
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(9);
  doc.text(COMPANY.tin, margin, y);
  let yFrom = y + 20;
  doc.setTextColor(110);
  doc.text("OFFICE ADDRESS:", margin, yFrom);
  yFrom += 13;
  doc.setTextColor(20);
  for (const line of COMPANY.addressLines) {
    doc.text(line, margin, yFrom);
    yFrom += 12;
  }
  let yTo = y + (clientNameLines.length - 1) * 13 + 20;
  if (invoice.clientAddress) {
    doc.setTextColor(110);
    doc.text("CUSTOMER ADDRESS:", colTo, yTo);
    yTo += 13;
    doc.setTextColor(20);
    for (const line of doc.splitTextToSize(invoice.clientAddress, right - colTo)) {
      doc.text(line, colTo, yTo);
      yTo += 12;
    }
  }
  const contact = [invoice.clientEmail, invoice.clientPhone].filter(Boolean);
  if (contact.length) {
    yTo += 4;
    for (const c of contact) {
      doc.text(String(c), colTo, yTo);
      yTo += 12;
    }
  }
  y = Math.max(yFrom, yTo) + 26;

  // Items table
  const cols = {
    desc: margin,
    qty: 320,
    rate: 400,
    disc: 445,
    vat: 488,
    total: right,
  };
  doc.setFillColor(243, 244, 246);
  doc.rect(margin - 6, y - 12, right - margin + 12, 20, "F");
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(80);
  doc.text("Description", cols.desc, y);
  doc.text("Qty", cols.qty, y, { align: "right" });
  doc.text("Rate", cols.rate, y, { align: "right" });
  doc.text("Disc %", cols.disc, y, { align: "right" });
  doc.text("VAT %", cols.vat, y, { align: "right" });
  doc.text("Total", cols.total, y, { align: "right" });
  y += 22;

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(9);
  doc.setTextColor(20);
  for (const it of invoice.items) {
    const descLines = doc.splitTextToSize(it.description, cols.qty - margin - 30);
    if (y + descLines.length * 12 > pageHeight - 180) {
      doc.addPage();
      y = 60;
    }
    doc.text(descLines, cols.desc, y);
    doc.text(
      it.quantity.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
      cols.qty,
      y,
      { align: "right" },
    );
    doc.text(fmtMoney(it.rate), cols.rate, y, { align: "right" });
    doc.text(fmtPct(it.discountPct), cols.disc, y, { align: "right" });
    doc.text(fmtPct(it.vatPct), cols.vat, y, { align: "right" });
    doc.setFont("NotoSans", "bold");
    doc.text(fmtMoney(lineNet(it)), cols.total, y, { align: "right" });
    doc.setFont("NotoSans", "normal");
    y += descLines.length * 12 + 12;
  }

  // Footer: bank details (left) + totals (right)
  const footY = Math.max(y + 30, pageHeight - 170);
  doc.setDrawColor(200);
  doc.line(margin, footY - 16, right, footY - 16);
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(9.5);
  doc.text(COMPANY.bankAccountName, margin, footY);
  doc.setFont("NotoSans", "normal");
  doc.text(COMPANY.bankAccountNumber, margin, footY + 14);
  doc.text(COMPANY.bankName, margin, footY + 28);

  doc.setTextColor(110);
  doc.text("Total Net:", right - 150, footY);
  doc.text("Total VAT:", right - 150, footY + 14);
  doc.setTextColor(20);
  doc.setFont("NotoSans", "bold");
  doc.text(fmtMoney(totals.net), right, footY, { align: "right" });
  doc.text(fmtMoney(totals.vat), right, footY + 14, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.setFont("NotoSans", "normal");
  doc.text(invoice.status === "paid" ? "AMOUNT PAID" : "BALANCE DUE", right, footY + 48, {
    align: "right",
  });
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(fmtMoney(totals.total), right, footY + 66, { align: "right" });

  // Page numbers (stamped last so the total count is known)
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`PAGE ${p}/${pageCount}`, right, pageHeight - 24, { align: "right" });
  }

  doc.save(`${invoice.invoiceNumber}.pdf`);
}

// ---------------------------------------------------------------------------

const FILTERS = ["all", "unpaid", "paid", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || map.unpaid}`}>
      {status}
    </Badge>
  );
}

type ItemDraft = {
  description: string;
  quantity: string;
  rate: string;
  discountPct: string;
  vatPct: string;
};

const EMPTY_ITEM: ItemDraft = {
  description: "",
  quantity: "1",
  rate: "",
  discountPct: "0",
  vatPct: "7.5",
};

const EMPTY_FORM = {
  clientName: "",
  clientAddress: "",
  clientEmail: "",
  clientPhone: "",
};

function parseItemDraft(d: ItemDraft): InvoiceItem | null {
  const quantity = Number(d.quantity);
  const rate = Number(d.rate.replace(/,/g, ""));
  const discountPct = Number(d.discountPct || "0");
  const vatPct = Number(d.vatPct || "0");
  if (
    !d.description.trim() ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    !Number.isFinite(discountPct) ||
    discountPct < 0 ||
    discountPct > 100 ||
    !Number.isFinite(vatPct) ||
    vatPct < 0 ||
    vatPct > 100
  ) {
    return null;
  }
  return { description: d.description.trim(), quantity, rate, discountPct, vatPct };
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { data: invoices, isLoading } = useListInvoices();
  const createInvoice = useCreateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const sendReceipt = useSendInvoiceReceipt();
  const deleteInvoice = useDeleteInvoice();

  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    invoice: Invoice;
    action: "paid" | "cancelled";
  } | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const filtered = invoices?.filter((i) => filter === "all" || i.status === filter) ?? [];

  const counts = {
    unpaid: invoices?.filter((i) => i.status === "unpaid").length ?? 0,
    paid: invoices?.filter((i) => i.status === "paid").length ?? 0,
    cancelled: invoices?.filter((i) => i.status === "cancelled").length ?? 0,
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });

  const draftItems = itemDrafts
    .map(parseItemDraft)
    .filter((i): i is InvoiceItem => i !== null);
  const draftTotals = computeTotals(draftItems);

  const updateItemDraft = (idx: number, patch: Partial<ItemDraft>) =>
    setItemDrafts((drafts) =>
      drafts.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );

  const submitCreate = () => {
    if (!form.clientName.trim()) {
      toast.error("Client name is required.");
      return;
    }
    const items = itemDrafts.map(parseItemDraft);
    if (items.length === 0 || items.some((i) => i === null)) {
      toast.error(
        "Each line item needs a description, a quantity above 0, and a rate.",
      );
      return;
    }
    createInvoice.mutate(
      {
        data: {
          clientName: form.clientName.trim(),
          clientAddress: form.clientAddress.trim() || undefined,
          clientEmail: form.clientEmail.trim() || undefined,
          clientPhone: form.clientPhone.trim() || undefined,
          items: items as InvoiceItem[],
        },
      },
      {
        onSuccess: (inv) => {
          invalidate();
          toast.success(`Invoice ${inv.invoiceNumber} created`);
          setCreateOpen(false);
          setForm(EMPTY_FORM);
          setItemDrafts([{ ...EMPTY_ITEM }]);
          setDetail(inv);
        },
        onError: (error) => {
          toast.error("Failed to create invoice", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      },
    );
  };

  const submitStatus = () => {
    if (!statusTarget) return;
    updateStatus.mutate(
      {
        id: statusTarget.invoice.id,
        data: { status: statusTarget.action, note: statusNote.trim() || undefined },
      },
      {
        onSuccess: (inv) => {
          invalidate();
          toast.success(
            statusTarget.action === "paid"
              ? "Invoice marked as paid"
              : "Invoice cancelled",
          );
          setStatusTarget(null);
          setDetail((d) => (d && d.id === inv.id ? inv : d));
        },
        onError: (error) => {
          toast.error("Failed to update invoice", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      },
    );
  };

  const submitDelete = () => {
    if (!deleteTarget) return;
    deleteInvoice.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(`Invoice ${deleteTarget.invoiceNumber} deleted`);
          setDetail((d) => (d && d.id === deleteTarget.id ? null : d));
          setDeleteTarget(null);
        },
        onError: (error) => {
          toast.error("Failed to delete invoice", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      },
    );
  };

  const recordReceiptShared = (invoice: Invoice) => {
    sendReceipt.mutate(
      { id: invoice.id },
      {
        onSuccess: (inv) => {
          invalidate();
          setDetail((d) => (d && d.id === inv.id ? inv : d));
        },
      },
    );
  };

  const shareReceipt = async (invoice: Invoice) => {
    const totals = invoiceTotals(invoice);
    const paidDate = invoice.paidAt ? fmtLongDate(invoice.paidAt) : "";
    const text = [
      `Payment Receipt — ${invoice.invoiceNumber}`,
      `From: ${COMPANY.name}`,
      `To: ${invoice.clientName}`,
      ``,
      ...invoice.items.map(
        (it) => `${it.description.split("\n")[0]} — ${fmtMoney(lineNet(it))}`,
      ),
      `VAT: ${fmtMoney(totals.vat)}`,
      `Amount paid: ${fmtMoney(totals.total)}`,
      paidDate ? `Payment date: ${paidDate}` : "",
      ``,
      `Thank you for your payment!`,
    ]
      .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
      .join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: `Receipt ${invoice.invoiceNumber}`, text });
        recordReceiptShared(invoice);
        toast.success("Receipt shared");
      } catch {
        // user closed the share sheet — not an error
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        recordReceiptShared(invoice);
        toast.success("Receipt copied", {
          description: "Paste it into WhatsApp, SMS, or any messaging app.",
        });
      } catch {
        toast.error("Could not copy the receipt. Try the Download PDF option instead.");
      }
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    setPdfBusy(true);
    try {
      await downloadInvoicePdf(invoice);
    } catch {
      toast.error("Could not generate the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const detailTotals = detail ? invoiceTotals(detail) : null;

  return (
    <div className="p-6 space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: fixed; inset: 0; background: white; padding: 40px;
            z-index: 9999; overflow: visible; max-height: none !important;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Bill your clients, track payments, and send receipts.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(EMPTY_FORM);
            setItemDrafts([{ ...EMPTY_ITEM }]);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Generate Invoice
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-md">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{counts.unpaid}</p>
            <p className="text-xs text-muted-foreground">Unpaid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-600">{counts.paid}</p>
            <p className="text-xs text-muted-foreground">Paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{counts.cancelled}</p>
            <p className="text-xs text-muted-foreground">Cancelled</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className="capitalize"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? (
                  filtered.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-label={`View invoice ${inv.invoiceNumber}`}
                      onClick={() => setDetail(inv)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetail(inv);
                        }
                      }}
                    >
                      <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>{inv.clientName}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmtMoney(Number(inv.amount) || 0)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {itemsSummary(inv.items)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {statusBadge(inv.status)}
                          {inv.receiptSentAt && (
                            <span title="Receipt sent">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-2 justify-end items-center">
                          {inv.status === "unpaid" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setStatusTarget({ invoice: inv, action: "paid" });
                                  setStatusNote("");
                                }}
                              >
                                Mark Paid
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setStatusTarget({ invoice: inv, action: "cancelled" });
                                  setStatusNote("");
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : inv.status === "paid" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => shareReceipt(inv)}
                            >
                              <Share2 className="h-4 w-4 mr-1" />
                              {inv.receiptSentAt ? "Share Again" : "Share Receipt"}
                            </Button>
                          ) : null}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 h-8 w-8"
                            aria-label={`Delete invoice ${inv.invoiceNumber}`}
                            onClick={() => setDeleteTarget(inv)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No invoices yet. Generate one for a client to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create invoice dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="inv-client">Client name *</Label>
              <Input
                id="inv-client"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="e.g. Nigerian Television Authority"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-address">Client address</Label>
              <Textarea
                id="inv-address"
                value={form.clientAddress}
                onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
                placeholder={"e.g. Area 11, Garki,\nAbuja,\nFederal Capital Territory"}
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-email">Client email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={form.clientEmail}
                  onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-phone">Client phone</Label>
                <Input
                  id="inv-phone"
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line items *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setItemDrafts((d) => [...d, { ...EMPTY_ITEM }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                </Button>
              </div>
              {itemDrafts.map((it, idx) => (
                <div key={idx} className="border rounded-md p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={it.description}
                      onChange={(e) => updateItemDraft(idx, { description: e.target.value })}
                      placeholder="What are you charging for? e.g. Production and installation of premium full vehicle branding..."
                      className="resize-none"
                      rows={2}
                      aria-label={`Item ${idx + 1} description`}
                    />
                    {itemDrafts.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 shrink-0"
                        aria-label={`Remove item ${idx + 1}`}
                        onClick={() =>
                          setItemDrafts((d) => d.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        inputMode="decimal"
                        value={it.quantity}
                        onChange={(e) => updateItemDraft(idx, { quantity: e.target.value })}
                        aria-label={`Item ${idx + 1} quantity`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rate ({NAIRA})</Label>
                      <Input
                        inputMode="decimal"
                        value={it.rate}
                        onChange={(e) => updateItemDraft(idx, { rate: e.target.value })}
                        placeholder="e.g. 279069.77"
                        aria-label={`Item ${idx + 1} rate`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Discount %</Label>
                      <Input
                        inputMode="decimal"
                        value={it.discountPct}
                        onChange={(e) => updateItemDraft(idx, { discountPct: e.target.value })}
                        aria-label={`Item ${idx + 1} discount percent`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">VAT %</Label>
                      <Input
                        inputMode="decimal"
                        value={it.vatPct}
                        onChange={(e) => updateItemDraft(idx, { vatPct: e.target.value })}
                        aria-label={`Item ${idx + 1} VAT percent`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Net</span>
                  <span>{fmtMoney(draftTotals.net)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total VAT</span>
                  <span>{fmtMoney(draftTotals.vat)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Balance Due</span>
                  <span>{fmtMoney(draftTotals.total)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createInvoice.isPending}>
              Generate Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / print dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice {detail?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {detail && detailTotals && (
            <div
              id="invoice-print-area"
              className="space-y-6 max-h-[65vh] overflow-y-auto bg-white text-black"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-bold italic tracking-wide">INVOICE</p>
                  <div className="mt-2 text-xs space-y-0.5">
                    <p>
                      <span className="text-muted-foreground mr-2">NUMBER:</span>
                      <span className="font-semibold">{detail.invoiceNumber}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground mr-2">DATE:</span>
                      <span className="font-semibold">{fmtLongDate(detail.createdAt)}</span>
                    </p>
                    {detail.paidAt && (
                      <p>
                        <span className="text-muted-foreground mr-2">PAID:</span>
                        <span className="font-semibold">{fmtLongDate(detail.paidAt)}</span>
                      </p>
                    )}
                  </div>
                  <div className="mt-1">{statusBadge(detail.status)}</div>
                </div>
                <img src={logoUrl} alt="Fifth Element Media Group" className="h-14 w-auto" />
              </div>

              {/* From / To */}
              <div className="grid grid-cols-2 gap-6 text-xs border-t pt-4">
                <div>
                  <p className="text-muted-foreground mb-1">FROM</p>
                  <p className="font-bold text-sm">{COMPANY.name}</p>
                  <p className="italic">{COMPANY.tin}</p>
                  <p className="text-muted-foreground mt-2">OFFICE ADDRESS:</p>
                  {COMPANY.addressLines.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">TO</p>
                  <p className="font-bold text-sm uppercase">{detail.clientName}</p>
                  {detail.clientAddress && (
                    <>
                      <p className="text-muted-foreground mt-2">CUSTOMER ADDRESS:</p>
                      <p className="whitespace-pre-wrap">{detail.clientAddress}</p>
                    </>
                  )}
                  {(detail.clientEmail || detail.clientPhone) && (
                    <div className="mt-2 space-y-0.5">
                      {detail.clientEmail && <p>{detail.clientEmail}</p>}
                      {detail.clientPhone && <p>{detail.clientPhone}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="text-left font-medium p-2">Description</th>
                      <th className="text-right font-medium p-2">Qty</th>
                      <th className="text-right font-medium p-2">Rate</th>
                      <th className="text-right font-medium p-2">Disc %</th>
                      <th className="text-right font-medium p-2">VAT %</th>
                      <th className="text-right font-medium p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, i) => (
                      <tr key={i} className="border-t align-top">
                        <td className="p-2 whitespace-pre-wrap break-words">
                          {it.description}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">
                          {it.quantity.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">{fmtMoney(it.rate)}</td>
                        <td className="p-2 text-right whitespace-nowrap">{fmtPct(it.discountPct)}</td>
                        <td className="p-2 text-right whitespace-nowrap">{fmtPct(it.vatPct)}</td>
                        <td className="p-2 text-right whitespace-nowrap font-semibold">
                          {fmtMoney(lineNet(it))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer: bank + totals */}
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <p className="font-bold">{COMPANY.bankAccountName}</p>
                  <p>{COMPANY.bankAccountNumber}</p>
                  <p>{COMPANY.bankName}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Net:</span>
                    <span className="font-semibold">{fmtMoney(detailTotals.net)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total VAT:</span>
                    <span className="font-semibold">{fmtMoney(detailTotals.vat)}</span>
                  </div>
                  <div className="pt-2 text-right">
                    <p className="text-muted-foreground">
                      {detail.status === "paid" ? "AMOUNT PAID" : "BALANCE DUE"}
                    </p>
                    <p className="text-lg font-bold">{fmtMoney(detailTotals.total)}</p>
                  </div>
                </div>
              </div>

              {detail.statusNote && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Note</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{detail.statusNote}</p>
                </div>
              )}
              {detail.receiptSentAt && (
                <p className="text-xs text-muted-foreground">
                  Receipt sent {detail.receiptSentAt.slice(0, 10)}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => detail && setDeleteTarget(detail)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button
              variant="outline"
              disabled={pdfBusy}
              onClick={() => detail && handleDownloadPdf(detail)}
            >
              <Download className="h-4 w-4 mr-1" />
              {pdfBusy ? "Preparing..." : "Download PDF"}
            </Button>
            {detail?.status === "unpaid" && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    setStatusTarget({ invoice: detail, action: "cancelled" });
                    setStatusNote("");
                  }}
                >
                  Cancel Invoice
                </Button>
                <Button
                  onClick={() => {
                    setStatusTarget({ invoice: detail, action: "paid" });
                    setStatusNote("");
                  }}
                >
                  Mark Paid
                </Button>
              </>
            )}
            {detail?.status === "paid" && (
              <Button onClick={() => shareReceipt(detail)}>
                <Share2 className="h-4 w-4 mr-1" />
                {detail.receiptSentAt ? "Share Again" : "Share Receipt"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice {deleteTarget?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the invoice for{" "}
            <span className="font-medium text-foreground">{deleteTarget?.clientName}</span>
            {deleteTarget ? ` (${fmtMoney(invoiceTotals(deleteTarget).total)})` : ""}. This
            can't be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={submitDelete}
              disabled={deleteInvoice.isPending}
            >
              Delete Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status confirmation dialog */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.action === "paid" ? "Mark Invoice as Paid" : "Cancel Invoice"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="invoice-status-note">Note (optional)</Label>
            <Textarea
              id="invoice-status-note"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder={
                statusTarget?.action === "paid"
                  ? "e.g. Paid via bank transfer on..."
                  : "Reason for cancelling this invoice..."
              }
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>
              Back
            </Button>
            <Button onClick={submitStatus} disabled={updateStatus.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
