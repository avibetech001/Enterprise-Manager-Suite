import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useCreateInvoice,
  useUpdateInvoiceStatus,
  useListFundRequests,
  getListInvoicesQueryKey,
  useGetCurrentSession,
  InvoiceWithDetails,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Printer, Plus, FileText } from "lucide-react";
import { toast } from "sonner";

const FILTERS = ["all", "pending", "paid", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || map.pending}`}>
      {status}
    </Badge>
  );
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { data: invoices, isLoading } = useListInvoices();
  const { data: fundRequests } = useListFundRequests();
  const createInvoice = useCreateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const { data: session } = useGetCurrentSession();

  const [filter, setFilter] = useState<Filter>("all");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceWithDetails | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    invoice: InvoiceWithDetails;
    action: "paid" | "rejected";
  } | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const invoicedIds = new Set(invoices?.map((i) => i.fundRequestId) ?? []);
  const invoiceable =
    fundRequests?.filter((r) => r.status === "approved" && !invoicedIds.has(r.id)) ?? [];

  const filtered = invoices?.filter((i) => filter === "all" || i.status === filter) ?? [];

  const counts = {
    pending: invoices?.filter((i) => i.status === "pending").length ?? 0,
    paid: invoices?.filter((i) => i.status === "paid").length ?? 0,
    rejected: invoices?.filter((i) => i.status === "rejected").length ?? 0,
  };

  const generate = (fundRequestId: number) => {
    createInvoice.mutate(
      { data: { fundRequestId } },
      {
        onSuccess: (inv) => {
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          toast.success(`Invoice ${inv.invoiceNumber} generated`);
          setGenerateOpen(false);
          setDetail(inv);
        },
        onError: (error) => {
          toast.error("Failed to generate invoice", {
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
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          toast.success(`Invoice marked as ${statusTarget.action}`);
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

  const printInvoice = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: fixed; inset: 0; background: white; padding: 40px;
            z-index: 9999; overflow: visible;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Generate, print, and track invoices for approved fund requests.
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Generate Invoice
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-md">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{counts.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
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
            <p className="text-2xl font-bold text-red-600">{counts.rejected}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
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
                  <TableHead>Employee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Date</TableHead>
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
                      <TableCell>{inv.employeeName}</TableCell>
                      <TableCell>{inv.amount}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{inv.purpose}</TableCell>
                      <TableCell className="text-sm">{inv.createdAt.slice(0, 10)}</TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {inv.status === "pending" ? (
                          <div className="flex gap-2 justify-end">
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
                                setStatusTarget({ invoice: inv, action: "rejected" });
                                setStatusNote("");
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No invoices yet. Generate one from an approved fund request.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Generate invoice dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pick an approved fund request that hasn't been invoiced yet.
          </p>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {invoiceable.length > 0 ? (
              invoiceable.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {r.employeeName} — {r.amount}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{r.purpose}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={createInvoice.isPending}
                    onClick={() => generate(r.id)}
                  >
                    <FileText className="h-4 w-4 mr-1" /> Invoice
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No approved fund requests are waiting for an invoice.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail / print dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Invoice {detail?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div
              id="invoice-print-area"
              ref={printRef}
              className="space-y-5 max-h-[60vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold">{session?.company.name || "5th Element"}</p>
                  <p className="text-xs text-muted-foreground">Fund Request Invoice</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{detail.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Issued {detail.createdAt.slice(0, 10)}
                  </p>
                  <div className="mt-1 flex justify-end">{statusBadge(detail.status)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm border-t pt-4">
                <div>
                  <p className="text-muted-foreground">Payee (Employee)</p>
                  <p className="font-medium">{detail.employeeName}</p>
                  {detail.employeeCode && (
                    <p className="text-xs text-muted-foreground">{detail.employeeCode}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Request date</p>
                  <p className="font-medium">{detail.requestDate.slice(0, 10)}</p>
                </div>
              </div>
              <div className="border rounded-md">
                <div className="flex justify-between items-start gap-4 p-3 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                  <span>Description</span>
                  <span>Amount</span>
                </div>
                <div className="flex justify-between items-start gap-4 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words">{detail.purpose}</p>
                    {detail.details && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words mt-1">
                        {detail.details}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold whitespace-nowrap">{detail.amount}</p>
                </div>
                <div className="flex justify-between items-center gap-4 p-3 border-t text-sm">
                  <span className="font-medium">Total</span>
                  <span className="font-bold">{detail.amount}</span>
                </div>
              </div>
              {detail.statusNote && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Note</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{detail.statusNote}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={printInvoice}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            {detail?.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    setStatusTarget({ invoice: detail, action: "rejected" });
                    setStatusNote("");
                  }}
                >
                  Reject
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status confirmation dialog */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.action === "paid" ? "Mark Invoice as Paid" : "Reject Invoice"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="invoice-status-note">
              Note (optional)
            </label>
            <Textarea
              id="invoice-status-note"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder={
                statusTarget?.action === "paid"
                  ? "e.g. Paid via bank transfer on..."
                  : "Reason for rejecting this invoice..."
              }
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
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
