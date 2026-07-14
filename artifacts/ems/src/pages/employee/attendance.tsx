import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMySummary,
  useListMyAttendance,
  useCheckIn,
  useCheckOut,
  getGetMySummaryQueryKey,
  getListMyAttendanceQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { CalendarClock, LogIn, LogOut, Printer } from "lucide-react";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function computeHours(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return "—";
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return "—";
  return (ms / (1000 * 60 * 60)).toFixed(2);
}

export default function EmployeeAttendance() {
  const queryClient = useQueryClient();
  const { data: summary } = useGetMySummary();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const [code, setCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode) setCode(urlCode);
  }, []);

  const params = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const { data: records, isLoading } = useListMyAttendance(params, {
    query: { queryKey: getListMyAttendanceQueryKey(params) },
  });

  const today = summary?.attendanceToday || null;
  const isCheckedIn = !!today;
  const isCheckedOut = !!today?.checkOutAt;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMySummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMyAttendanceQueryKey() });
  };

  const handleCheckIn = () => {
    if (!code.trim()) {
      toast.error("Attendance code required", { description: "Enter today's attendance code." });
      return;
    }
    checkIn.mutate(
      { data: { code: code.trim() } },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Checked in successfully");
          setCode("");
        },
        onError: (err) => {
          toast.error("Failed to check in", { description: err.data?.error || "Unknown error" });
        },
      }
    );
  };

  const handleCheckOut = () => {
    checkOut.mutate(undefined, {
      onSuccess: () => {
        invalidate();
        toast.success("Checked out successfully");
      },
      onError: (err) => {
        toast.error("Failed to check out", { description: err.data?.error || "Unknown error" });
      },
    });
  };

  const handleExportPDF = () => {
    const rows = (records || [])
      .map(
        (r) => `
        <tr>
          <td>${new Date(r.forDate).toLocaleDateString()}</td>
          <td>${formatTime(r.checkInAt)}</td>
          <td>${formatTime(r.checkOutAt)}</td>
          <td>${computeHours(r.checkInAt, r.checkOutAt)}</td>
        </tr>`
      )
      .join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>My Attendance</title>
          <style>
            body { font-family: -apple-system, Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p { color: #6b7280; margin-top: 0; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
            th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
          </style>
        </head>
        <body>
          <h1>My Attendance History</h1>
          <p>Generated ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4">No records</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-muted-foreground" />
          Attendance
        </h1>
        <p className="text-muted-foreground mt-1">Check in daily and review your attendance history.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Today</CardTitle>
          <CardDescription>{new Date().toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isCheckedIn ? (
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 max-w-md">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="attendance-code">Attendance Code</Label>
                <Input
                  id="attendance-code"
                  placeholder="Enter today's code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button onClick={handleCheckIn} disabled={checkIn.isPending}>
                <LogIn className="h-4 w-4 mr-2" />
                Check In
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Check In</p>
                  <p className="font-medium mt-1">{formatTime(today!.checkInAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Check Out</p>
                  <p className="font-medium mt-1">{formatTime(today!.checkOutAt)}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    isCheckedOut
                      ? "bg-muted text-muted-foreground border-border"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }
                >
                  {isCheckedOut ? "Checked out" : "Checked in"}
                </Badge>
              </div>
              {!isCheckedOut && (
                <Button variant="outline" onClick={handleCheckOut} disabled={checkOut.isPending}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Check Out
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>History</CardTitle>
              <CardDescription>Your past attendance records</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="from" className="text-xs">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to" className="text-xs">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
              </div>
              <Button variant="outline" onClick={handleExportPDF}>
                <Printer className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full"></div>
            </div>
          ) : !records || records.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">No attendance records found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.forDate).toLocaleDateString()}</TableCell>
                    <TableCell>{formatTime(r.checkInAt)}</TableCell>
                    <TableCell>{formatTime(r.checkOutAt)}</TableCell>
                    <TableCell>{computeHours(r.checkInAt, r.checkOutAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
