import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRequisitions,
  useReviewRequisition,
  getListRequisitionsQueryKey,
  RequisitionWithUser,
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
type ReviewAction = "approved" | "rejected" | "fulfilled";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || map.pending}`}>
      {status}
    </Badge>
  );
}

const ACTION_LABEL: Record<ReviewAction, string> = {
  approved: "Approve",
  rejected: "Reject",
  fulfilled: "Mark fulfilled",
};

export default function RequisitionsPage() {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useListRequisitions();
  const reviewRequisition = useReviewRequisition();

  const [filter, setFilter] = useState<Filter>("all");
  const [reviewTarget, setReviewTarget] = useState<{ req: RequisitionWithUser; action: ReviewAction } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const filtered = requests?.filter((r) => filter === "all" || r.status === filter) ?? [];

  const openReview = (req: RequisitionWithUser, action: ReviewAction) => {
    setReviewTarget({ req, action });
    setReviewNote("");
  };

  const submitReview = () => {
    if (!reviewTarget) return;
    reviewRequisition.mutate(
      { id: reviewTarget.req.id, data: { status: reviewTarget.action, reviewNote: reviewNote || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRequisitionsQueryKey() });
          toast.success(`Requisition ${reviewTarget.action}`);
          setReviewTarget(null);
        },
        onError: (error) => {
          toast.error("Failed to review requisition", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Requisitions</h1>
        <p className="text-muted-foreground mt-1">Review, approve, and fulfil employee requisitions.</p>
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
                  <TableHead>Item</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell>{r.quantity}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{r.reason}</TableCell>
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
                        ) : r.status === "approved" ? (
                          <Button size="sm" variant="outline" onClick={() => openReview(r, "fulfilled")}>
                            Mark fulfilled
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No requisitions found.
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
              {reviewTarget ? ACTION_LABEL[reviewTarget.action] : ""} Requisition
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
            <Button onClick={submitReview} disabled={reviewRequisition.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
