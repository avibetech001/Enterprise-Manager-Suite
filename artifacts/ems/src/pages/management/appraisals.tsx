import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAppraisals,
  useCreateAppraisal,
  useDeleteAppraisal,
  useListEmployees,
  getListAppraisalsQueryKey,
  type Appraisal,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { ClipboardCheck, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CRITERIA = [
  "Punctuality",
  "Quality of work",
  "Teamwork",
  "Communication",
  "Initiative",
];

export function ScoreStars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

export function AppraisalCard({
  appraisal,
  onDelete,
}: {
  appraisal: Appraisal;
  onDelete?: () => void;
}) {
  const avg =
    appraisal.ratings.length > 0
      ? appraisal.ratings.reduce((s, r) => s + r.score, 0) / appraisal.ratings.length
      : 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{appraisal.userName}</CardTitle>
            <CardDescription>
              {appraisal.periodLabel ? `${appraisal.periodLabel} · ` : ""}
              {new Date(appraisal.createdAt).toLocaleDateString()} · by {appraisal.createdByName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{avg.toFixed(1)} / 5</Badge>
            {onDelete && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {appraisal.ratings.map((r) => (
          <div key={r.criterion} className="flex items-center justify-between text-sm">
            <span>{r.criterion}</span>
            <ScoreStars score={r.score} />
          </div>
        ))}
        {appraisal.overallComment && (
          <p className="text-sm text-muted-foreground border-t pt-2 mt-2 whitespace-pre-wrap">
            {appraisal.overallComment}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManagementAppraisalsPage() {
  const queryClient = useQueryClient();
  const { data: appraisals, isLoading } = useListAppraisals();
  useNotificationFocus(!!appraisals);
  const { data: employees } = useListEmployees();
  const createAppraisal = useCreateAppraisal();
  const deleteAppraisal = useDeleteAppraisal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");

  const activeEmployees =
    employees?.filter((e) => e.accountStatus === "active" && !e.archived) ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAppraisalsQueryKey() });

  const openDialog = () => {
    setUserId("");
    setPeriodLabel("");
    setScores(Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c, 3])));
    setComment("");
    setDialogOpen(true);
  };

  const handleCreate = () => {
    if (!userId) {
      toast.error("Select an employee.");
      return;
    }
    createAppraisal.mutate(
      {
        data: {
          userId: Number(userId),
          periodLabel: periodLabel.trim() || undefined,
          ratings: DEFAULT_CRITERIA.map((c) => ({
            criterion: c,
            score: scores[c] ?? 3,
          })),
          overallComment: comment.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setDialogOpen(false);
          toast.success("Appraisal saved");
        },
        onError: (err) =>
          toast.error("Failed to save appraisal", {
            description: err.data?.error || "Unknown error",
          }),
      },
    );
  };

  const handleDelete = (a: Appraisal) => {
    if (!window.confirm(`Delete this appraisal for ${a.userName}?`)) return;
    deleteAppraisal.mutate(
      { id: a.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Appraisal deleted");
        },
        onError: (err) =>
          toast.error("Failed to delete appraisal", {
            description: err.data?.error || "Unknown error",
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
            Appraisals
          </h1>
          <p className="text-muted-foreground mt-1">
            Rate employee performance. Employees can see their own appraisals.
          </p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4 mr-1.5" /> New Appraisal
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (appraisals || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No appraisals yet. Create the first one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(appraisals || []).map((a) => (
            <div key={a.id} id={`focus-${a.id}`}>
              <AppraisalCard appraisal={a} onDelete={() => handleDelete(a)} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Appraisal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period (optional)</Label>
              <Input
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="e.g. Q3 2026 or July 2026"
              />
            </div>
            <div className="space-y-3">
              <Label>Ratings</Label>
              {DEFAULT_CRITERIA.map((c) => (
                <div key={c} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{c}</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScores((s) => ({ ...s, [c]: n }))}
                        aria-label={`${c}: ${n} of 5`}
                      >
                        <Star
                          className={`h-5 w-5 transition-colors ${
                            n <= (scores[c] ?? 0)
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30 hover:text-amber-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Overall comments (optional)</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Strengths, areas to improve, goals..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createAppraisal.isPending}>
              {createAppraisal.isPending ? "Saving..." : "Save Appraisal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
