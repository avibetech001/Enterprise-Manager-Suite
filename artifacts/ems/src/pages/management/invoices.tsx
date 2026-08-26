import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useCreateInvoice,
  useUpdateInvoiceStatus,
  useSendInvoiceReceipt,
  useDeleteInvoice,
  useRecordInvoicePayment,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Plus, Mail, Download, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import logoUrl from "@/assets/invoice-logo.png";
import twistLogoUrl from "@/assets/twist-logo.png";
import notoRegularUrl from "@/assets/NotoSans-Regular.ttf";
import notoBoldUrl from "@/assets/NotoSans-Bold.ttf";

// ---------------------------------------------------------------------------
// Company letterhead details (from the official invoice template)
// ---------------------------------------------------------------------------
const COMPANY = {
  key: "fifth_element",
  label: "5th Element Media Group",
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

const TWIST_COMPANY = {
  key: "twist_entertainment",
  label: "Twist Entertainment",
  name: "TWIST ENTERTAINMENT",
  bankAccountName: "Twist Afro Media",
  bankAccountNumber: "1015628403",
  bankName: "Zenith Bank",
};

type IssuerKey = "fifth_element" | "twist_entertainment";

function issuerProfile(issuer: Invoice["issuer"]) {
  return issuer === "twist_entertainment" ? TWIST_COMPANY : COMPANY;
}

const NAIRA = "\u20A6";
const VAT_PERCENT = 7.5;

function fmtMoney(n: number): string {
  return (
    NAIRA +
    n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function lineNet(it: InvoiceItem): number {
  return it.quantity * it.rate;
}

// Totals for a saved invoice. Older invoices (created before line items
// existed) have no items — fall back to the stored amount.
function invoiceTotals(invoice: Invoice) {
  const storedTotal = Number(invoice.amount);
  if (invoice.items.length === 0) {
    const amt = Number.isFinite(storedTotal) ? storedTotal : 0;
    return { net: amt, vat: 0, total: amt };
  }
  const computed = computeTotals(invoice.items);
  if (!Number.isFinite(storedTotal)) return computed;
  return {
    net: computed.net,
    vat: Math.max(0, storedTotal - computed.net),
    total: storedTotal,
  };
}

// Payment position: how much has been paid and what's still owed.
function paymentState(invoice: Invoice) {
  const total = invoiceTotals(invoice).total;
  const recorded = invoice.payments.reduce((s, p) => s + p.amount, 0);
  // Legacy fully-paid invoices may have no payment entries
  const paid =
    invoice.status === "paid" ? total : Math.min(recorded, total);
  const remaining = Math.max(0, total - paid);
  return { total, paid, remaining };
}

function computeTotals(items: InvoiceItem[]) {
  let net = 0;
  let vat = 0;
  for (const it of items) {
    const n = lineNet(it);
    net += n;
    vat += (n * VAT_PERCENT) / 100;
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
let pdfAssets: {
  regular: string;
  bold: string;
  logo: string;
  twistLogo: string;
} | null = null;

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
  const [regular, bold, logo, twistLogo] = await Promise.all([
    urlToDataUrl(notoRegularUrl),
    urlToDataUrl(notoBoldUrl),
    urlToDataUrl(logoUrl),
    urlToDataUrl(twistLogoUrl),
  ]);
  pdfAssets = {
    regular: regular.split(",")[1],
    bold: bold.split(",")[1],
    logo,
    twistLogo,
  };
  return pdfAssets;
}

async function downloadTwistInvoicePdf(
  invoice: Invoice,
  assets: NonNullable<typeof pdfAssets>,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", assets.regular);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", assets.bold);
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const right = pageWidth - margin;
  const totals = invoiceTotals(invoice);
  const payment = paymentState(invoice);
  const cols = { number: margin + 10, desc: margin + 32, qty: 390, rate: 475, total: right };
  const rowLineHeight = 12;
  const rowGap = 18;
  const footerTop = pageHeight - 46;
  const closingSectionHeight = 225;

  function projectNameLines(): string[] {
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(9);
    return doc.splitTextToSize(
      invoice.projectName?.trim() || " ",
      right - margin - 82,
    ) as string[];
  }

  function drawTableHeader(projectY: number): number {
    doc.setTextColor(25);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    doc.text("PROJECT NAME:", margin, projectY);
    doc.setFont("NotoSans", "bold");
    const nameLines = projectNameLines();
    doc.text(nameLines, margin + 82, projectY);
    const headerY = projectY + nameLines.length * 11 + 16;

    doc.setFillColor(229, 31, 39);
    doc.rect(margin, headerY - 16, right - margin, 30, "F");
    doc.setTextColor(255);
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(8.5);
    doc.text("#", cols.number, headerY);
    doc.text("Item & Description", cols.desc, headerY);
    doc.text("Qty", cols.qty, headerY, { align: "right" });
    doc.text("Rate", cols.rate, headerY, { align: "right" });
    doc.text("Amount", cols.total, headerY, { align: "right" });
    return headerY + 28;
  }

  function continuationClientNameLines(): string[] {
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(9);
    const maxWidth = right - margin;
    const lines = doc.splitTextToSize(
      invoice.clientName.toUpperCase(),
      maxWidth,
    ) as string[];
    if (lines.length <= 2) return lines;

    let lastLine = lines[1];
    while (
      lastLine.length > 0 &&
      doc.getTextWidth(`${lastLine}...`) > maxWidth
    ) {
      lastLine = lastLine.slice(0, -1);
    }
    return [lines[0], `${lastLine}...`];
  }

  function addContinuationPage(withTableHeader = true): number {
    doc.addPage();
    doc.addImage(assets.twistLogo, "PNG", margin, 28, 110, 49);
    doc.setTextColor(25);
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(9);
    doc.text(`Reference No: ${invoice.invoiceNumber}`, right, 43, {
      align: "right",
    });
    doc.setFont("NotoSans", "normal");
    doc.text("Bill To", margin, 92);
    doc.text(fmtLongDate(invoice.createdAt), right, 92, { align: "right" });

    const nameLines = continuationClientNameLines();
    doc.setFont("NotoSans", "bold");
    doc.text(nameLines, margin, 108);
    const identityBottom = 108 + nameLines.length * 11;
    return withTableHeader
      ? drawTableHeader(identityBottom + 18)
      : identityBottom + 12;
  }

  function drawFirstPageContext(): number {
    doc.addImage(assets.twistLogo, "PNG", margin, 38, 165, 74);
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(10);
    doc.setTextColor(25);
    doc.text(`Reference No: ${invoice.invoiceNumber}`, margin, 145);

    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    doc.text("Bill To", margin, 176);
    doc.setFont("NotoSans", "bold");
    doc.text("Invoice Date:", right - 170, 176);
    doc.setFont("NotoSans", "normal");
    doc.text(fmtLongDate(invoice.createdAt), right, 176, { align: "right" });

    const contextWidth = 300;
    const contextBlocks: Array<{
      lines: string[];
      bold: boolean;
      gapAfter: number;
    }> = [
      {
        lines: doc.splitTextToSize(
          invoice.clientName.toUpperCase(),
          contextWidth,
        ) as string[],
        bold: true,
        gapAfter: 8,
      },
    ];
    if (invoice.clientAddress) {
      contextBlocks.push({
        lines: doc.splitTextToSize(invoice.clientAddress, contextWidth) as string[],
        bold: false,
        gapAfter: 4,
      });
    }
    for (const value of [invoice.clientEmail, invoice.clientPhone].filter(Boolean)) {
      contextBlocks.push({
        lines: doc.splitTextToSize(String(value), contextWidth) as string[],
        bold: false,
        gapAfter: 2,
      });
    }

    const contextBottomLimit = footerTop - 44;
    let contextY = 194;
    for (const block of contextBlocks) {
      doc.setFont("NotoSans", block.bold ? "bold" : "normal");
      for (const line of block.lines) {
        if (contextY > contextBottomLimit) {
          contextY = addContinuationPage(false);
          doc.setFont("NotoSans", block.bold ? "bold" : "normal");
        }
        doc.text(line, margin, contextY);
        contextY += 11;
      }
      contextY += block.gapAfter;
    }

    const tableHeaderY =
      doc.getNumberOfPages() === 1
        ? Math.max(contextY + 16, 275)
        : contextY + 16;
    const minimumTableSpace =
      projectNameLines().length * 11 + 44 + rowLineHeight + rowGap;
    if (tableHeaderY + minimumTableSpace > footerTop) {
      return addContinuationPage();
    }
    return drawTableHeader(tableHeaderY);
  }

  let y = drawFirstPageContext();

  doc.setTextColor(20);
  doc.setFontSize(9);
  invoice.items.forEach((item, index) => {
    const splitLines = doc.splitTextToSize(
      item.description || " ",
      cols.qty - cols.desc - 22,
    ) as string[];
    const descriptionLines = splitLines.length > 0 ? splitLines : [" "];
    let lineIndex = 0;
    let isFirstChunk = true;

    while (lineIndex < descriptionLines.length) {
      const availableLines = Math.floor(
        (footerTop - y - rowGap) / rowLineHeight,
      );
      if (availableLines < 1) {
        y = addContinuationPage();
        continue;
      }

      const chunk = descriptionLines.slice(
        lineIndex,
        lineIndex + availableLines,
      );
      doc.setFont("NotoSans", "normal");
      if (isFirstChunk) {
        doc.text(`${index + 1}.`, cols.number, y);
      }
      doc.setFont("NotoSans", "bold");
      doc.text(chunk, cols.desc, y);

      if (isFirstChunk) {
        doc.setFont("NotoSans", "normal");
        doc.text(item.quantity.toFixed(2), cols.qty, y, { align: "right" });
        doc.text(fmtMoney(item.rate), cols.rate, y, { align: "right" });
        doc.text(fmtMoney(lineNet(item)), cols.total, y, { align: "right" });
      }

      lineIndex += chunk.length;
      y += chunk.length * rowLineHeight + rowGap;
      isFirstChunk = false;

      if (lineIndex < descriptionLines.length) {
        y = addContinuationPage();
      }
    }
  });

  if (y + closingSectionHeight > footerTop) {
    y = addContinuationPage();
  }

  doc.setDrawColor(205);
  doc.line(margin, y, right, y);
  y += 32;

  const totalsX = right - 190;
  doc.setFillColor(248, 248, 248);
  doc.rect(totalsX, y - 16, right - totalsX, 72, "F");
  doc.setFont("NotoSans", "normal");
  doc.setTextColor(80);
  doc.text("Total Net", totalsX + 14, y);
  doc.text(`VAT (${VAT_PERCENT}%)`, totalsX + 14, y + 18);
  doc.setFont("NotoSans", "bold");
  doc.setTextColor(20);
  doc.text(fmtMoney(totals.net), right - 14, y, { align: "right" });
  doc.text(fmtMoney(totals.vat), right - 14, y + 18, { align: "right" });
  doc.text("TOTAL", totalsX + 14, y + 42);
  doc.text(`NGN ${totals.total.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`, right - 14, y + 42, { align: "right" });

  let notesY = y + 82;
  if (payment.paid > 0) {
    doc.setFont("NotoSans", "normal");
    doc.text("Amount Paid", totalsX + 14, notesY);
    doc.setFont("NotoSans", "bold");
    doc.text(fmtMoney(payment.paid), right - 14, notesY, { align: "right" });
    notesY += 18;
    doc.setFont("NotoSans", "normal");
    doc.text("Balance Remaining", totalsX + 14, notesY);
    doc.setFont("NotoSans", "bold");
    doc.text(fmtMoney(payment.remaining), right - 14, notesY, { align: "right" });
  }

  doc.setTextColor(20);
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(10);
  doc.text("Notes", margin, y + 82);
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(9);
  doc.text("Thank you for your patronage", margin, y + 97);
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(10);
  doc.text("Terms & Conditions", margin, y + 137);
  doc.setFontSize(9);
  doc.text("ALL PAYMENTS TO BE MADE TO:", margin, y + 154);
  doc.setFont("NotoSans", "normal");
  doc.text(TWIST_COMPANY.bankAccountName, margin, y + 169);
  doc.text(TWIST_COMPANY.bankAccountNumber, margin, y + 181);
  doc.text(TWIST_COMPANY.bankName, margin, y + 193);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(165);
    doc.line(margin, pageHeight - 30, right, pageHeight - 30);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`PAGE ${page}/${pageCount}`, right, pageHeight - 16, {
      align: "right",
    });
  }

  doc.save(`${invoice.invoiceNumber}-Twist.pdf`);
}

async function downloadInvoicePdf(invoice: Invoice) {
  const assets = await loadPdfAssets();
  if (invoice.issuer === "twist_entertainment") {
    await downloadTwistInvoicePdf(invoice, assets);
    return;
  }
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

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("PROJECT NAME:", margin, y);
  doc.setFont("NotoSans", "bold");
  doc.setTextColor(20);
  const projectLines = doc.splitTextToSize(
    invoice.projectName?.trim() || " ",
    right - margin - 82,
  );
  doc.text(projectLines, margin + 82, y);
  y += projectLines.length * 12 + 18;

  // Items table
  const cols = {
    desc: margin,
    qty: 385,
    rate: 475,
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
  doc.text(`Total VAT (${VAT_PERCENT}%):`, right - 150, footY + 14);
  doc.setTextColor(20);
  doc.setFont("NotoSans", "bold");
  doc.text(fmtMoney(totals.net), right, footY, { align: "right" });
  doc.text(fmtMoney(totals.vat), right, footY + 14, { align: "right" });

  const state = paymentState(invoice);
  let extraY = footY + 28;
  if (state.paid > 0) {
    extraY += 14;
    doc.setFont("NotoSans", "normal");
    doc.setTextColor(110);
    doc.text("Amount Paid:", right - 150, extraY);
    doc.setFont("NotoSans", "bold");
    doc.setTextColor(20);
    doc.text(fmtMoney(state.paid), right, extraY, { align: "right" });
  }

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.setFont("NotoSans", "normal");
  const bigLabel =
    invoice.status === "paid"
      ? "AMOUNT PAID"
      : invoice.status === "part_paid"
        ? "BALANCE REMAINING"
        : "BALANCE DUE";
  const bigValue =
    invoice.status === "part_paid" ? state.remaining : totals.total;
  doc.text(bigLabel, right, extraY + 24, { align: "right" });
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(fmtMoney(bigValue), right, extraY + 42, { align: "right" });

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

function TwistInvoicePreview({ invoice }: { invoice: Invoice }) {
  const totals = invoiceTotals(invoice);
  const payment = paymentState(invoice);

  return (
    <div className="space-y-6">
      <img
        src={twistLogoUrl}
        alt="Twist Entertainment"
        className="h-24 w-auto"
      />
      <p className="text-sm font-bold">
        Reference No: {invoice.invoiceNumber}
      </p>
      <div className="grid grid-cols-2 gap-6 text-xs">
        <div>
          <p className="mb-1">Bill To</p>
          <p className="font-bold uppercase">{invoice.clientName}</p>
          {invoice.clientAddress && (
            <p className="mt-3 whitespace-pre-wrap">{invoice.clientAddress}</p>
          )}
          {invoice.clientEmail && <p className="mt-1">{invoice.clientEmail}</p>}
          {invoice.clientPhone && <p>{invoice.clientPhone}</p>}
        </div>
        <div className="text-right">
          <span className="font-bold">Invoice Date: </span>
          {fmtLongDate(invoice.createdAt)}
          <div className="mt-2 flex justify-end">
            {statusBadge(invoice.status)}
          </div>
        </div>
      </div>

      <p className="text-sm">
        <span className="font-normal">PROJECT NAME: </span>
        <span className="font-bold">{invoice.projectName || ""}</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#e51f27] text-white">
              <th className="p-3 text-left">#</th>
              <th className="p-3 text-left">Item &amp; Description</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3 text-right">Rate</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index} className="border-b align-top">
                <td className="p-3">{index + 1}.</td>
                <td className="p-3 whitespace-pre-wrap font-semibold">
                  {item.description}
                </td>
                <td className="p-3 text-right">{item.quantity.toFixed(2)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {fmtMoney(item.rate)}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {fmtMoney(lineNet(item))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="text-xs space-y-7">
          <div>
            <p className="font-bold text-sm">Notes</p>
            <p>Thank you for your patronage</p>
          </div>
          <div>
            <p className="font-bold text-sm">Terms &amp; Conditions</p>
            <p className="font-bold">ALL PAYMENTS TO BE MADE TO:</p>
            <p>{TWIST_COMPANY.bankAccountName}</p>
            <p>{TWIST_COMPANY.bankAccountNumber}</p>
            <p>{TWIST_COMPANY.bankName}</p>
          </div>
        </div>
        <div className="text-xs space-y-1 bg-muted/30 p-4 self-start">
          <div className="flex justify-between">
            <span>Total Net</span>
            <span className="font-semibold">{fmtMoney(totals.net)}</span>
          </div>
          <div className="flex justify-between">
            <span>VAT ({VAT_PERCENT}%)</span>
            <span className="font-semibold">{fmtMoney(totals.vat)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
            <span>TOTAL</span>
            <span>
              NGN {totals.total.toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          {payment.paid > 0 && (
            <>
              <div className="flex justify-between pt-2">
                <span>Amount Paid</span>
                <span className="font-semibold text-emerald-700">
                  {fmtMoney(payment.paid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Balance Remaining</span>
                <span className="font-semibold text-amber-700">
                  {fmtMoney(payment.remaining)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const FILTERS = ["all", "unpaid", "part_paid", "paid", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  unpaid: "Unpaid",
  part_paid: "Part-paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    part_paid: "bg-blue-50 text-blue-700 border-blue-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const labels: Record<string, string> = { part_paid: "part-paid" };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || map.unpaid}`}>
      {labels[status] || status}
    </Badge>
  );
}

type ItemDraft = {
  description: string;
  quantity: string;
  rate: string;
};

const EMPTY_ITEM: ItemDraft = {
  description: "",
  quantity: "1",
  rate: "",
};

const EMPTY_FORM = {
  issuer: "fifth_element" as IssuerKey,
  clientName: "",
  projectName: "",
  clientAddress: "",
  clientEmail: "",
  clientPhone: "",
};

function parseItemDraft(d: ItemDraft): InvoiceItem | null {
  const quantity = Number(d.quantity);
  const rate = Number(d.rate.replace(/,/g, ""));
  if (
    !d.description.trim() ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0
  ) {
    return null;
  }
  return { description: d.description.trim(), quantity, rate };
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { data: invoices, isLoading } = useListInvoices();
  const createInvoice = useCreateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const sendReceipt = useSendInvoiceReceipt();
  const deleteInvoice = useDeleteInvoice();
  const recordPayment = useRecordInvoicePayment();

  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
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
    partPaid: invoices?.filter((i) => i.status === "part_paid").length ?? 0,
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
    if (!form.projectName.trim()) {
      toast.error("Project name is required.");
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
          issuer: form.issuer,
          clientName: form.clientName.trim(),
          projectName: form.projectName.trim(),
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

  const openPaymentDialog = (invoice: Invoice) => {
    const { remaining } = paymentState(invoice);
    setPaymentTarget(invoice);
    setPaymentAmount(remaining > 0 ? String(Math.round(remaining * 100) / 100) : "");
    setPaymentNote("");
  };

  const submitPayment = () => {
    if (!paymentTarget) return;
    const raw = Number(paymentAmount.replace(/,/g, ""));
    // Normalize to 2 decimal places (kobo)
    const amount = Math.round(raw * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a payment amount above zero.");
      return;
    }
    const { remaining } = paymentState(paymentTarget);
    if (Math.round(amount * 100) > Math.round(remaining * 100)) {
      toast.error(
        `That's more than the balance remaining (${fmtMoney(remaining)}).`,
      );
      return;
    }
    recordPayment.mutate(
      {
        id: paymentTarget.id,
        data: { amount, note: paymentNote.trim() || undefined },
      },
      {
        onSuccess: (inv) => {
          invalidate();
          const state = paymentState(inv);
          toast.success(
            inv.status === "paid"
              ? "Payment recorded — invoice fully paid"
              : `Payment recorded — ${fmtMoney(state.remaining)} remaining`,
          );
          setPaymentTarget(null);
          setDetail((d) => (d && d.id === inv.id ? inv : d));
        },
        onError: (error) => {
          toast.error("Failed to record payment", {
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
    const issuer = issuerProfile(invoice.issuer);
    const totals = invoiceTotals(invoice);
    const state = paymentState(invoice);
    const lastPayment = invoice.payments[invoice.payments.length - 1];
    const paidDate = lastPayment
      ? fmtLongDate(lastPayment.date)
      : invoice.paidAt
        ? fmtLongDate(invoice.paidAt)
        : "";
    const fullyPaid = invoice.status === "paid";
    const text = [
      `Payment Receipt — ${invoice.invoiceNumber}`,
      `From: ${issuer.name}`,
      `To: ${invoice.clientName}`,
      ``,
      ...invoice.items.map(
        (it) => `${it.description.split("\n")[0]} — ${fmtMoney(lineNet(it))}`,
      ),
      `VAT: ${fmtMoney(totals.vat)}`,
      `Invoice total: ${fmtMoney(state.total)}`,
      lastPayment ? `Payment received: ${fmtMoney(lastPayment.amount)}` : "",
      `Total paid to date: ${fmtMoney(state.paid)}`,
      fullyPaid
        ? `Balance remaining: ${fmtMoney(0)} — PAID IN FULL`
        : `Balance remaining: ${fmtMoney(state.remaining)}`,
      paidDate ? `Payment date: ${paidDate}` : "",
      ``,
      fullyPaid ? `Thank you for your payment!` : `Thank you for your payment. We look forward to receiving the balance.`,
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{counts.unpaid}</p>
            <p className="text-xs text-muted-foreground">Unpaid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{counts.partPaid}</p>
            <p className="text-xs text-muted-foreground">Part-paid</p>
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
            onClick={() => setFilter(f)}
          >
            {FILTER_LABELS[f]}
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
                  <TableHead>Issuing company</TableHead>
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
                      <TableCell>{issuerProfile(inv.issuer).label}</TableCell>
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
                          {inv.status === "unpaid" || inv.status === "part_paid" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPaymentDialog(inv)}
                              >
                                Record Payment
                              </Button>
                              {inv.status === "part_paid" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => shareReceipt(inv)}
                                >
                                  <Share2 className="h-4 w-4 mr-1" /> Receipt
                                </Button>
                              )}
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
              <Label htmlFor="inv-issuer">Issuing company *</Label>
              <Select
                value={form.issuer}
                onValueChange={(value: IssuerKey) =>
                  setForm({ ...form, issuer: value })
                }
              >
                <SelectTrigger id="inv-issuer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifth_element">
                    5th Element Media Group
                  </SelectItem>
                  <SelectItem value="twist_entertainment">
                    Twist Entertainment
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The selected company’s logo, invoice format, and bank details
                will be used.
              </p>
            </div>
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
              <Label htmlFor="inv-project">Project name *</Label>
              <Input
                id="inv-project"
                value={form.projectName}
                onChange={(e) =>
                  setForm({ ...form, projectName: e.target.value })
                }
                placeholder="e.g. Changan Eado Plus Vehicle Branding"
                maxLength={200}
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
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>
                </div>
              ))}
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Net</span>
                  <span>{fmtMoney(draftTotals.net)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total VAT ({VAT_PERCENT}%)</span>
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
              {detail.issuer === "twist_entertainment" ? (
                <TwistInvoicePreview invoice={detail} />
              ) : (
                <>
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
              <p className="text-sm">
                <span>PROJECT NAME: </span>
                <span className="font-bold">{detail.projectName || ""}</span>
              </p>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="text-left font-medium p-2">Description</th>
                      <th className="text-right font-medium p-2">Qty</th>
                      <th className="text-right font-medium p-2">Rate</th>
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
                    <span className="text-muted-foreground">Total VAT ({VAT_PERCENT}%):</span>
                    <span className="font-semibold">{fmtMoney(detailTotals.vat)}</span>
                  </div>
                  {(detail.payments.length > 0 || detail.status === "paid") && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount Paid:</span>
                        <span className="font-semibold text-emerald-700">
                          {fmtMoney(paymentState(detail).paid)}
                        </span>
                      </div>
                      {detail.status !== "paid" && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Balance Remaining:</span>
                          <span className="font-semibold text-amber-700">
                            {fmtMoney(paymentState(detail).remaining)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="pt-2 text-right">
                    <p className="text-muted-foreground">
                      {detail.status === "paid"
                        ? "AMOUNT PAID"
                        : detail.status === "part_paid"
                          ? "BALANCE REMAINING"
                          : "BALANCE DUE"}
                    </p>
                    <p className="text-lg font-bold">
                      {fmtMoney(
                        detail.status === "part_paid"
                          ? paymentState(detail).remaining
                          : detailTotals.total,
                      )}
                    </p>
                  </div>
                </div>
              </div>
                </>
              )}

              {detail.payments.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1 font-medium">Payment history</p>
                  <div className="border rounded-md divide-y">
                    {detail.payments.map((p, i) => (
                      <div key={i} className="flex justify-between items-start gap-3 p-2">
                        <div className="min-w-0">
                          <p>{fmtLongDate(p.date)}</p>
                          {p.note && (
                            <p className="text-muted-foreground break-words">{p.note}</p>
                          )}
                        </div>
                        <p className="font-semibold whitespace-nowrap">
                          {fmtMoney(p.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
            {(detail?.status === "unpaid" || detail?.status === "part_paid") && (
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
                <Button onClick={() => openPaymentDialog(detail)}>
                  Record Payment
                </Button>
              </>
            )}
            {(detail?.status === "paid" || detail?.status === "part_paid") && (
              <Button
                variant={detail.status === "paid" ? "default" : "outline"}
                onClick={() => shareReceipt(detail)}
              >
                <Share2 className="h-4 w-4 mr-1" />
                {detail.receiptSentAt ? "Share Again" : "Share Receipt"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment dialog */}
      <Dialog open={!!paymentTarget} onOpenChange={(o) => !o && setPaymentTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {paymentTarget?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {paymentTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice total</span>
                  <span>{fmtMoney(paymentState(paymentTarget).total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid so far</span>
                  <span>{fmtMoney(paymentState(paymentTarget).paid)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Balance remaining</span>
                  <span>{fmtMoney(paymentState(paymentTarget).remaining)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment amount ({NAIRA}) *</Label>
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 750000"
                />
                <p className="text-xs text-muted-foreground">
                  For half payment, enter part of the balance — the invoice is marked
                  part-paid until the full amount is received.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-note">Note (optional)</Label>
                <Textarea
                  id="payment-note"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. Bank transfer — first instalment"
                  className="resize-none"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>
              Back
            </Button>
            <Button onClick={submitPayment} disabled={recordPayment.isPending}>
              Record Payment
            </Button>
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
