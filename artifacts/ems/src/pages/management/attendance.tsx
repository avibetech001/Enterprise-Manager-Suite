import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useGetAttendanceCode, useListAttendanceRecords } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { QrCode } from "lucide-react";

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
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

export default function AttendancePage() {
  const [date, setDate] = useState(todayStr());
  const { data: codeData, isLoading: codeLoading } = useGetAttendanceCode();
  const { data: records, isLoading: recordsLoading } = useListAttendanceRecords({ date });

  const code = codeData?.code ?? "";
  const checkInUrl = `${window.location.origin}${import.meta.env.BASE_URL}employee/attendance?code=${code}`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground mt-1">Share today's check-in code and review attendance records.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Today's Check-in Code
            </CardTitle>
            <CardDescription>Employees scan or type this code to check in.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {codeLoading ? (
              <Skeleton className="h-[200px] w-[200px]" />
            ) : code ? (
              <>
                <div className="rounded-lg border bg-white p-4">
                  <QRCodeSVG value={checkInUrl} size={200} />
                </div>
                <div className="text-center">
                  <p className="text-3xl font-mono font-bold tracking-widest">{code}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    This code rotates daily. Employees can scan the QR code or type it manually.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8">No code available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <CardTitle>Attendance Records</CardTitle>
                <CardDescription>Check-ins for the selected date.</CardDescription>
              </div>
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
                    <TableHead>Code</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records && records.length > 0 ? (
                    records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{r.employeeCode || "—"}</TableCell>
                        <TableCell>{formatTime(r.checkInAt)}</TableCell>
                        <TableCell>{formatTime(r.checkOutAt)}</TableCell>
                        <TableCell>{computeHours(r.checkInAt, r.checkOutAt)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No attendance records for this date.
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
  );
}
