import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CalendarClock, Printer, ScanLine } from "lucide-react";

function extractCode(decodedText: string): string {
  // QR encodes a URL like https://.../employee/attendance?code=ABC123 — or may be the raw code.
  try {
    const url = new URL(decodedText);
    const fromUrl = url.searchParams.get("code");
    if (fromUrl) return fromUrl;
  } catch {
    // not a URL — treat as raw code
  }
  return decodedText.trim();
}

function QrScannerDialog({
  open,
  onOpenChange,
  onScan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);
  onScanRef.current = onScan;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;

    // Defer so the dialog portal content (including #qr-scanner-region) is in the DOM.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not available in this browser. Type the code manually instead.");
        return;
      }
      if (!document.getElementById("qr-scanner-region")) {
        setError("Could not start the camera. Type the code manually instead.");
        return;
      }
      try {
        const scanner = new Html5Qrcode("qr-scanner-region");
        scannerRef.current = scanner;
        scanner
          .start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              if (cancelled) return;
              cancelled = true;
              scanner
                .stop()
                .catch(() => undefined)
                .finally(() => {
                  onScanRef.current(extractCode(decodedText));
                  onOpenChangeRef.current(false);
                });
            },
            () => undefined // per-frame decode misses; ignore
          )
          .catch((err) => {
            if (!cancelled) {
              setError(
                String(err).includes("NotAllowedError")
                  ? "Camera access was denied. Allow camera permission and try again, or type the code manually."
                  : "Could not start the camera. Type the code manually instead."
              );
            }
          });
      } catch {
        setError("Could not start the camera. Type the code manually instead.");
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try {
          s.stop().catch(() => undefined);
        } catch {
          // already stopped
        }
      }
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Attendance QR Code</DialogTitle>
          <DialogDescription>
            Point your camera at the QR code posted at your office.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <div id="qr-scanner-region" className="w-full overflow-hidden rounded-lg" />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Best-effort geolocation; resolves null if unavailable/denied so the server
// can decide whether location is required.
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (val: { lat: number; lng: number } | null) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    // Hard timeout: getCurrentPosition's own `timeout` does not cover the time
    // a permission prompt sits undecided, which would hang the check-in forever.
    const timer = window.setTimeout(() => done(null), 10000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function statusBadge(status: string | null | undefined) {
  if (!status) return null;
  const cls =
    status === "on_time"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <Badge variant="outline" className={cls}>
      <span className="capitalize">{status.replace("_", " ")}</span>
    </Badge>
  );
}

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

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const urlCodeHandled = useRef(false);

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

  // If the page was opened by scanning the QR with a phone camera
  // (…/employee/attendance?code=XYZ), submit automatically.
  useEffect(() => {
    if (!summary || urlCodeHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (!urlCode) return;
    urlCodeHandled.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    if (!summary.attendanceToday) {
      handleCheckIn(urlCode);
    } else if (!summary.attendanceToday.checkOutAt) {
      handleCheckOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMySummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMyAttendanceQueryKey() });
  };

  const handleCheckIn = async (scannedCode: string) => {
    const useCode = scannedCode.trim();
    if (!useCode) return;
    const pos = await getPosition();
    checkIn.mutate(
      { data: { code: useCode, lat: pos?.lat ?? null, lng: pos?.lng ?? null } },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Checked in successfully");
        },
        onError: (err) => {
          toast.error("Failed to check in", { description: err.data?.error || "Unknown error" });
        },
      }
    );
  };

  const handleCheckOut = async () => {
    const pos = await getPosition();
    checkOut.mutate(
      { data: { lat: pos?.lat ?? null, lng: pos?.lng ?? null } },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Checked out successfully");
        },
        onError: (err) => {
          toast.error("Failed to check out", { description: err.data?.error || "Unknown error" });
        },
      }
    );
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
      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(scanned) => {
          if (!isCheckedIn) {
            handleCheckIn(scanned);
          }
        }}
      />
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
            <div className="space-y-3 max-w-md">
              <p className="text-sm text-muted-foreground">
                Scan the attendance QR code posted at your office to check in.
              </p>
              <Button onClick={() => setScannerOpen(true)} disabled={checkIn.isPending}>
                <ScanLine className="h-4 w-4 mr-2" />
                {checkIn.isPending ? "Checking in..." : "Scan QR to Check In"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Check In</p>
                  <div className="font-medium mt-1 flex items-center gap-2">
                    {formatTime(today!.checkInAt)}
                    {statusBadge(today!.checkInStatus)}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Check Out</p>
                  <div className="font-medium mt-1 flex items-center gap-2">
                    {formatTime(today!.checkOutAt)}
                    {statusBadge(today!.checkOutStatus)}
                  </div>
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
                <div className="space-y-3 max-w-md">
                  <p className="text-sm text-muted-foreground">
                    Leaving for the day? Just tap the button below — no QR scan needed.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => handleCheckOut()}
                    disabled={checkOut.isPending}
                  >
                    {checkOut.isPending ? "Checking out..." : "Check Out"}
                  </Button>
                </div>
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.forDate).toLocaleDateString()}</TableCell>
                    <TableCell>{formatTime(r.checkInAt)}</TableCell>
                    <TableCell>{formatTime(r.checkOutAt)}</TableCell>
                    <TableCell>{computeHours(r.checkInAt, r.checkOutAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.checkInStatus === "late" && statusBadge("late")}
                        {r.checkOutStatus === "early" && statusBadge("early")}
                        {r.checkInStatus !== "late" && r.checkOutStatus !== "early" && statusBadge("on_time")}
                      </div>
                    </TableCell>
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
