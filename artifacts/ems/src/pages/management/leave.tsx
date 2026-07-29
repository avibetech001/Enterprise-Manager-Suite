import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLeaveRequests,
  useReviewLeaveRequest,
  getListLeaveRequestsQueryKey,
  LeaveRequestWithUser,
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

const FILTERS = ["all", "pending", "approved", "rejected"] as const;
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

export default function LeavePage() {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useListLeaveRequests();
  useNotificationFocus(!!requests);
  const reviewLeave = useReviewLeaveRequest();

  const [filter, setFilter] = useState<Filter>("all");
  const [reviewTarget, setReviewTarget] = useState<{ req: LeaveRequestWithUser; action: "approved" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [detailTarget, setDetailTarget] = useState<LeaveRequestWithUser | null>(null);
  const [detailNote, setDetailNote] = useState("");

  const openDetail = (req: LeaveRequestWithUser) => {
    setDetailTarget(req);
    setDetailNote("");
  };

  const submitFromDetail = (req: LeaveRequestWithUser, action: "approved" | "rejected") => {
    reviewLeave.mutate(
      { id: req.id, data: { status: action, reviewNote: detailNote.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPendingCountsQueryKey() });
          toast.success(`Leave request ${action}`);
          setDetailTarget(null);
        },
        onError: (error) => {
          toast.error("Failed to review leave request", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      }
    );
  };

  const filtered = requests?.filter((r) => filter === "all" || r.status === filter) ?? [];

  const openReview = (req: LeaveRequestWithUser, action: "approved" | "rejected") => {
    setReviewTarget({ req, action });
    setReviewNote("");
  };

  const submitReview = () => {
    if (!reviewTarget) return;
    reviewLeave.mutate(
      { id: reviewTarget.req.id, data: { status: reviewTarget.action, reviewNote: reviewNote || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPendingCountsQueryKey() });
          toast.success(`Leave request ${reviewTarget.action}`);
          setReviewTarget(null);
        },
        onError: (error) => {
          toast.error("Failed to review leave request", {
            description: error.data?.error || "Unknown error occurred",
          });
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leave Requests</h1>
        <p className="text-muted-foreground mt-1">Review and manage employee leave requests.</p>
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
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? (
                  filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      id={`focus-${r.id}`}
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-label={`View leave request from ${r.employeeName}`}
                      onClick={() => openDetail(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(r);
                        }
                      }}
                    >
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell className="capitalize">{r.type}</TableCell>
                      <TableCell className="text-sm">
                        {r.startDate} → {r.endDate}
                      </TableCell>
                      <TableCell>{r.days}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{r.reason}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {r.reviewNote || "—"}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
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
                      No leave requests found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Full details: tap a row to read the complete reason and review note. */}
      <Dialog open={!!detailTarget} onOpenChange={(o) => !o && setDetailTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{detailTarget.employeeName}</span>
                {statusBadge(detailTarget.status)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="capitalize">{detailTarget.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days</p>
                  <p>{detailTarget.days}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p>{detailTarget.startDate} → {detailTarget.endDate}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Reason</p>
                <p className="whitespace-pre-wrap break-words rounded bg-muted/60 p-3">
                  {detailTarget.reason || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Review Note</p>
                <p className="whitespace-pre-wrap break-words rounded bg-muted/60 p-3">
                  {detailTarget.reviewNote || "—"}
                </p>
              </div>
              {detailTarget.status === "pending" && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="leave-detail-note">
                      Review note (optional)
                    </label>
                    <Textarea
                      id="leave-detail-note"
                      value={detailNote}
                      onChange={(e) => setDetailNote(e.target.value)}
                      placeholder="Write a note for the employee before approving or rejecting..."
                      className="resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      disabled={reviewLeave.isPending}
                      onClick={() => submitFromDetail(detailTarget, "rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={reviewLeave.isPending}
                      onClick={() => submitFromDetail(detailTarget, "approved")}
                    >
                      Approve
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewTarget?.action === "approved" ? "Approve" : "Reject"} Leave Request
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
            <Button onClick={submitReview} disabled={reviewLeave.isPending}>
              Confirm {reviewTarget?.action === "approved" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
