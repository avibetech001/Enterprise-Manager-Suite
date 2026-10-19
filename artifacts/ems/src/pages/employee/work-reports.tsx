import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyWorkReports,
  useCreateWorkReport,
  getListMyWorkReportsQueryKey,
  useGetMyProfile,
  useListDepartments,
  getListDepartmentsQueryKey,
  useListChatGroups,
  getListChatGroupsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { NotebookPen, Plus, CalendarDays } from "lucide-react";

const PERIOD_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const PERIOD_BADGE: Record<string, string> = {
  daily: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  weekly: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  monthly:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
};

function todayStr() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function formatDateStr(d: string, style: "short" | "long" = "short") {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: style === "short" ? "short" : "long",
    day: "numeric",
  });
}

export default function EmployeeWorkReports() {
  const queryClient = useQueryClient();
  const { data: reports, isLoading } = useListMyWorkReports();
  const { data: profile } = useGetMyProfile();
  const { data: chatGroups } = useListChatGroups({
    query: {
      queryKey: getListChatGroupsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const { data: departments } = useListDepartments({
    query: {
      queryKey: getListDepartmentsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const ledTeamChats = (chatGroups || []).filter(
    (group) =>
      group.id.startsWith("custom-team-") &&
      group.teamLeadUserId === profile?.id,
  );
  const isDepartmentLead = Boolean(
    profile &&
      departments?.some((department) => department.teamLeadUserId === profile.id),
  );
  const canSubmit = ledTeamChats.length > 0 || isDepartmentLead;
  const selectedLedTeam =
    ledTeamChats.length === 1
      ? ledTeamChats[0]
      : ledTeamChats.find((group) => group.id === selectedTeamId);

  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportDate, setReportDate] = useState(todayStr());
  const [endDate, setEndDate] = useState("");
  const [content, setContent] = useState("");
  const [detail, setDetail] = useState<null | {
    period: string;
    reportDate: string;
    endDate?: string | null;
    content: string;
  }>(null);

  const createReport = useCreateWorkReport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListMyWorkReportsQueryKey(),
        });
        toast.success("Report submitted", {
          description: "Management can now see your report.",
        });
        setContent("");
        setEndDate("");
        setOpen(false);
      },
      onError: (err: any) => {
        toast.error("Couldn't submit report", {
          description: err?.response?.data?.error || "Please try again.",
        });
      },
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error("Please write what you did before submitting.");
      return;
    }
    if (!reportDate) {
      toast.error("Please pick the date the report covers.");
      return;
    }
    if (period !== "daily") {
      if (!endDate) {
        toast.error("Please pick the end date the report covers.");
        return;
      }
      if (endDate < reportDate) {
        toast.error("The end date must be on or after the start date.");
        return;
      }
    }
    if (ledTeamChats.length > 1 && !selectedLedTeam) {
      toast.error("Choose which team this report is for.");
      return;
    }
    createReport.mutate({
      data: {
        period,
        reportDate,
        endDate: period === "daily" ? undefined : endDate,
        content: content.trim(),
        teamId: selectedLedTeam
          ? Number(selectedLedTeam.id.replace("custom-team-", ""))
          : undefined,
      },
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <NotebookPen className="h-7 w-7 text-muted-foreground" />
            My Work Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            {canSubmit
              ? "Submit daily, weekly, or monthly reports for management."
              : "Only an assigned Team Lead can submit reports. Management can assign leads in Team Chat Management or Departments."}
          </p>
        </div>
        {canSubmit && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Report
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : !reports || reports.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <NotebookPen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No reports yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {canSubmit
              ? "Submit your first report so management can follow your work."
              : "Your assigned Team Lead will submit team reports for management to review."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() =>
                setDetail({
                  period: r.period,
                  reportDate: r.reportDate,
                  endDate: r.endDate,
                  content: r.content,
                })
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <Badge className={PERIOD_BADGE[r.period] || ""} variant="secondary">
                    {PERIOD_LABEL[r.period] || r.period}
                  </Badge>
                  <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateStr(r.reportDate)}
                    {r.endDate ? ` → ${formatDateStr(r.endDate)}` : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">
                  {r.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New report dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Work Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {ledTeamChats.length > 1 ? (
              <div className="space-y-2">
                <Label>Team</Label>
                <Select
                  value={selectedTeamId}
                  onValueChange={setSelectedTeamId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {ledTeamChats.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : selectedLedTeam ? (
              <div className="flex items-center gap-2 text-sm">
                <Label>Team</Label>
                <Badge variant="outline">{selectedLedTeam.name}</Badge>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Report type</Label>
                <Select
                  value={period}
                  onValueChange={(v) => {
                    setPeriod(v as typeof period);
                    setEndDate("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wr-date">
                  {period === "daily" ? "Day covered" : "Start date"}
                </Label>
                <Input
                  id="wr-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>
            </div>
            {period !== "daily" && (
              <div className="space-y-2">
                <Label htmlFor="wr-end-date">End date</Label>
                <Input
                  id="wr-end-date"
                  type="date"
                  value={endDate}
                  min={reportDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="wr-content">What did you do?</Label>
              <Textarea
                id="wr-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Summarize the work you completed, progress made, and anything blocking you..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createReport.isPending}>
              {createReport.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail && (
                <>
                  <Badge
                    className={PERIOD_BADGE[detail.period] || ""}
                    variant="secondary"
                  >
                    {PERIOD_LABEL[detail.period] || detail.period}
                  </Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    {formatDateStr(detail.reportDate, "long")}
                    {detail.endDate
                      ? ` → ${formatDateStr(detail.endDate, "long")}`
                      : ""}
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap break-words">
              {detail?.content}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
