import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAttendanceCode,
  useListAttendanceRecords,
  useGetAttendanceSettings,
  useUpdateAttendanceSettings,
  listAttendanceRecords,
  getListAttendanceRecordsQueryKey,
  getGetAttendanceSettingsQueryKey,
  type WeeklySchedule,
  type DaySchedule,
} from "@workspace/api-client-react";
import ExcelJS from "exceljs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DayKey = keyof WeeklySchedule;

const DAY_ORDER: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Download, QrCode, Printer, MapPin, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  return { from: `${month}-01`, to: lastDay };
}

function formatExportTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function computeHours(checkIn: string, checkOut: string | null) {
  if (!checkOut) return "—";
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return "—";
  return (ms / (1000 * 60 * 60)).toFixed(2);
}

function statusBadges(r: { checkInStatus: string | null; checkOutStatus: string | null }) {
  const badges: Array<{ label: string; cls: string }> = [];
  if (r.checkInStatus === "late") badges.push({ label: "Late", cls: "bg-amber-50 text-amber-700 border-amber-200" });
  if (r.checkOutStatus === "early") badges.push({ label: "Left early", cls: "bg-amber-50 text-amber-700 border-amber-200" });
  if (!badges.length) badges.push({ label: "On time", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" });
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <Badge key={b.label} variant="outline" className={b.cls}>
          {b.label}
        </Badge>
      ))}
    </div>
  );
}

function formatDistance(m: number | null) {
  if (m === null || m === undefined) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function AttendanceSettingsCard() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetAttendanceSettings();
  const update = useUpdateAttendanceSettings();

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("200");
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings && !loaded) {
      setLat(settings.officeLat === null ? "" : String(settings.officeLat));
      setLng(settings.officeLng === null ? "" : String(settings.officeLng));
      setRadius(String(settings.radiusMeters));
      setSchedule(settings.schedule);
      setLoaded(true);
    }
  }, [settings, loaded]);

  const setDay = (key: DayKey, patch: Partial<DaySchedule>) => {
    setSchedule((s) => (s ? { ...s, [key]: { ...s[key], ...patch } } : s));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        toast.success("Location captured", { description: "Save settings to apply it." });
      },
      () => toast.error("Could not get your location", { description: "Allow location access and try again." }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSave = () => {
    const latNum = lat.trim() === "" ? null : Number(lat);
    const lngNum = lng.trim() === "" ? null : Number(lng);
    if ((latNum === null) !== (lngNum === null)) {
      toast.error("Enter both latitude and longitude, or clear both.");
      return;
    }
    if ((latNum !== null && Number.isNaN(latNum)) || (lngNum !== null && Number.isNaN(lngNum))) {
      toast.error("Latitude and longitude must be numbers.");
      return;
    }
    const radiusNum = Number(radius);
    if (Number.isNaN(radiusNum) || radiusNum < 10) {
      toast.error("Radius must be at least 10 meters.");
      return;
    }
    update.mutate(
      {
        data: {
          officeLat: latNum,
          officeLng: lngNum,
          radiusMeters: Math.round(radiusNum),
          ...(schedule ? { schedule } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAttendanceSettingsQueryKey() });
          toast.success("Attendance settings saved");
        },
        onError: (err) => {
          toast.error("Failed to save settings", { description: err.data?.error || "Unknown error" });
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Attendance Rules
        </CardTitle>
        <CardDescription>
          Office location, allowed check-in radius, and work hours used to flag late arrivals and early departures.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="office-lat">Office Latitude</Label>
                <Input id="office-lat" placeholder="e.g. 6.524379" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="office-lng">Office Longitude</Label>
                <Input id="office-lng" placeholder="e.g. 3.379206" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
              <MapPin className="h-4 w-4 mr-2" />
              Use my current location
            </Button>
            <div className="max-w-[200px] space-y-1.5">
              <Label htmlFor="radius">Radius (m)</Label>
              <Input id="radius" type="number" min={10} value={radius} onChange={(e) => setRadius(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Weekly Schedule</Label>
              <div className="space-y-2">
                {schedule &&
                  DAY_ORDER.map(({ key, label }) => {
                    const day = schedule[key];
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-2">
                        <span className="w-24 text-sm">{label}</span>
                        <Select
                          value={day.mode}
                          onValueChange={(v) => setDay(key, { mode: v as DaySchedule["mode"] })}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="office">Office</SelectItem>
                            <SelectItem value="remote">Remote</SelectItem>
                            <SelectItem value="off">Off</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="time"
                          className="w-[120px]"
                          value={day.start}
                          disabled={day.mode === "off"}
                          onChange={(e) => setDay(key, { start: e.target.value })}
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                          type="time"
                          className="w-[120px]"
                          value={day.end}
                          disabled={day.mode === "off"}
                          onChange={(e) => setDay(key, { end: e.target.value })}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              When an office location is set, employees must be within the radius to check in or out. Leave latitude and
              longitude empty to disable the location check.
            </p>
            <Button onClick={handleSave} disabled={update.isPending}>
              Save Settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [exporting, setExporting] = useState(false);
  const { data: codeData, isLoading: codeLoading } = useGetAttendanceCode();
  const params = { date };
  const { data, isLoading: recordsLoading } = useListAttendanceRecords(params, {
    query: {
      queryKey: getListAttendanceRecordsQueryKey(params),
      refetchInterval: 60_000,
    },
  });
  const qrRef = useRef<HTMLDivElement>(null);

  const records = data?.records ?? [];
  const absent = data?.absent ?? [];

  const code = codeData?.code ?? "";
  const checkInUrl = `${window.location.origin}${import.meta.env.BASE_URL}employee/attendance?code=${code}`;

  const handlePrint = () => {
    const svg = qrRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Attendance Check-in Code</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; margin: 0; }
        .qr { padding: 24px; border: 1px solid #ddd; border-radius: 12px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p.sub { color: #666; margin-top: 0; margin-bottom: 24px; }
        .code { font-family: ui-monospace, monospace; font-size: 40px; letter-spacing: 0.3em; font-weight: 700; margin-top: 24px; }
        p.hint { color: #666; font-size: 14px; }
      </style></head><body>
      <h1>Employee Check-in</h1>
      <p class="sub">Scan this QR code with your phone camera to check in or out</p>
      <div class="qr">${svg}</div>
      <div class="code">${code}</div>
      <p class="hint">Or type this code manually on your Attendance page.</p>
      <script>window.onload = () => { window.print(); };<\/script>
      </body></html>`);
    win.document.close();
  };

  const handleMonthDownload = async () => {
    setExporting(true);
    try {
      const { from, to } = monthBounds(month);
      const monthly = await listAttendanceRecords({ from, to });
      if (monthly.records.length === 0) {
        toast.info("No attendance records found for the selected month.");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "5th Element EMS";
      const sheet = workbook.addWorksheet("Monthly Attendance");
      sheet.columns = [
        { header: "Date", key: "date", width: 14 },
        { header: "Employee Code", key: "employeeCode", width: 18 },
        { header: "Employee Name", key: "employeeName", width: 30 },
        { header: "Check In", key: "checkIn", width: 14 },
        { header: "Check Out", key: "checkOut", width: 14 },
        { header: "Hours", key: "hours", width: 12 },
        { header: "Check-In Status", key: "checkInStatus", width: 18 },
        { header: "Check-Out Status", key: "checkOutStatus", width: 18 },
        { header: "Check-In Distance (m)", key: "checkInDistance", width: 23 },
        { header: "Check-Out Distance (m)", key: "checkOutDistance", width: 24 },
      ];
      for (const record of monthly.records) {
        sheet.addRow({
          date: record.forDate,
          employeeCode: record.employeeCode ?? "",
          employeeName: record.employeeName,
          checkIn: formatExportTime(record.checkInAt),
          checkOut: formatExportTime(record.checkOutAt),
          hours: computeHours(record.checkInAt, record.checkOutAt),
          checkInStatus:
            record.checkInStatus === "late" ? "Late" : "On time",
          checkOutStatus:
            record.checkOutStatus === "early"
              ? "Left early"
              : record.checkOutStatus === "on_time"
                ? "On time"
                : "",
          checkInDistance: record.checkInDistanceM ?? "",
          checkOutDistance: record.checkOutDistanceM ?? "",
        });
      }
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F2937" },
      };
      sheet.getRow(1).alignment = { vertical: "middle" };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: "J1" };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance_${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Monthly attendance downloaded.");
    } catch (error) {
      toast.error("Could not download monthly attendance", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground mt-1">
          Share the check-in code, set attendance rules, and review records.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Check-in Code
              </CardTitle>
              <CardDescription>Employees scan this QR code to check in and out.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {codeLoading ? (
                <Skeleton className="h-[200px] w-[200px]" />
              ) : code ? (
                <>
                  <div className="rounded-lg border bg-white p-4" ref={qrRef}>
                    <QRCodeSVG value={checkInUrl} size={200} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">
                      This is your company's permanent attendance QR code. Print it and post it at the office entrance.
                    </p>
                  </div>
                  <Button variant="outline" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print QR Code
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8">No code available.</p>
              )}
            </CardContent>
          </Card>

          <AttendanceSettingsCard />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <CardTitle>Attendance Records</CardTitle>
                  <CardDescription>
                    Check-ins and completed-workday absences for the selected date.
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="date-filter" className="text-xs">Date</Label>
                    <Input
                      id="date-filter"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-[180px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="month-export" className="text-xs">
                      Download month
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="month-export"
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="w-[160px]"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleMonthDownload}
                        disabled={exporting || !month}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {exporting ? "Downloading..." : "Download"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {recordsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Distance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length > 0 || absent.length > 0 ? (
                      <>
                        {records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.employeeName}
                            {r.employeeCode && (
                              <span className="text-muted-foreground font-mono text-xs ml-2">{r.employeeCode}</span>
                            )}
                          </TableCell>
                          <TableCell>{formatTime(r.checkInAt)}</TableCell>
                          <TableCell>{formatTime(r.checkOutAt)}</TableCell>
                          <TableCell>{computeHours(r.checkInAt, r.checkOutAt)}</TableCell>
                          <TableCell>{statusBadges(r)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatDistance(r.checkInDistanceM)}
                          </TableCell>
                        </TableRow>
                        ))}
                        {absent.map((employee) => (
                          <TableRow key={`absent-${employee.userId}`}>
                            <TableCell className="font-medium">
                              {employee.employeeName}
                              {employee.employeeCode && (
                                <span className="text-muted-foreground font-mono text-xs ml-2">
                                  {employee.employeeCode}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="bg-red-50 text-red-700 border-red-200"
                              >
                                Absent
                              </Badge>
                            </TableCell>
                            <TableCell>—</TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No attendance or absence records for this date.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
