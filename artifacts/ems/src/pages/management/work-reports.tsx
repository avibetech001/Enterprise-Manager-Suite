import { useMemo, useState } from "react";
import { useListWorkReports } from "@workspace/api-client-react";
import { useNotificationFocus } from "@/lib/use-notification-focus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import { NotebookPen, CalendarDays, Search } from "lucide-react";

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

function formatDateStr(d: string, style: "short" | "long" = "short") {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: style === "short" ? "short" : "long",
    day: "numeric",
  });
}

export default function ManagementWorkReports() {
  const { data: reports, isLoading } = useListWorkReports();
  useNotificationFocus(!!reports);

  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!reports) return [];
    return reports.filter((r) => {
      if (periodFilter !== "all" && r.period !== periodFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !r.employeeName.toLowerCase().includes(q) &&
          !(r.employeeCode || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [reports, periodFilter, search]);

  const detail = reports?.find((r) => r.id === detailId) || null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <NotebookPen className="h-7 w-7 text-muted-foreground" />
          Work Reports
        </h1>
        <p className="text-muted-foreground mt-1">
          Daily, weekly, and monthly reports submitted by employees.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by employee name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <NotebookPen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No reports found</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {reports && reports.length > 0
              ? "Try changing the filters above."
              : "No employees have submitted work reports yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} id={`focus-${r.id}`}>
              <Card
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setDetailId(r.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    <span>{r.employeeName}</span>
                    {r.employeeCode && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {r.employeeCode}
                      </span>
                    )}
                    <Badge
                      className={PERIOD_BADGE[r.period] || ""}
                      variant="secondary"
                    >
                      {PERIOD_LABEL[r.period] || r.period}
                    </Badge>
                    <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground ml-auto">
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
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {detail && (
                <>
                  <span>{detail.employeeName}</span>
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
          {detail && (
            <p className="text-xs text-muted-foreground">
              Submitted{" "}
              {new Date(detail.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
