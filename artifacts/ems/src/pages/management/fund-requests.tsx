import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFundRequests,
  useReviewFundRequest,
  getListFundRequestsQueryKey,
  FundRequestWithUser,
  getGetPendingCountsQueryKey,
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
import { toast } from "sonner";

const FILTERS = ["all", "pending"] as const;
type Filter = (typeof FILTERS)[number];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || map.pending}`}>
      {status}
    </Badge>
  );
}

export default function FundRequestsPage() {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useListFundRequests();
  useNotificationFocus(!!requests);
  const reviewFund = useReviewFundRequest();

  const [filter, setFilter] = useState<Filter>("all");
  const [reviewTarget, setReviewTarget] = useState<{ req: FundRequestWithUser; action: "approved" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const filtered = requests?.filter((r) => filter === "all" || r.status === filter) ?? [];

  const openReview = (req: FundRequestWithUser, action: "approved" | "rejected") => {
    setReviewTarget({ req, action });
    setReviewNote("");
  };

  const submitReview = () => {
    if (!reviewTarget) return;
    reviewFund.mutate(
      { id: reviewTarget.req.id, data: { status: reviewTarget.action, reviewNote: reviewNote || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFundRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPendingCountsQueryKey() });
          toast.success(`Fund request ${reviewTarget.action}`);
          setReviewTarget(null);
        },
        onError: (error) => {
          toast.error("Failed to review fund request", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fund Requests</h1>
        <p className="text-muted-foreground mt-1">Review and approve employee fund requests.</p>
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
                  <TableHead>Employee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? (
                  filtered.map((r) => (
                    <TableRow key={r.id} id={`focus-${r.id}`}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell>{r.amount}</TableCell>
                      <TableCell>{r.purpose}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                        {r.details || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.createdAt.slice(0, 10)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {r.reviewNote || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "pending" ? (
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => openReview(r, "approved")}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => openReview(r, "rejected")}
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No fund requests found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewTarget?.action === "approved" ? "Approve" : "Reject"} Fund Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Review note (optional)</label>
            <Textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Add an optional note for the employee..."
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitReview} disabled={reviewFund.isPending}>
              Confirm {reviewTarget?.action === "approved" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
