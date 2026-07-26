import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyLeaveBalance,
  useListMyLeaveRequests,
  useCreateLeaveRequest,
  getGetMyLeaveBalanceQueryKey,
  getListMyLeaveRequestsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Palmtree, Plus } from "lucide-react";

const leaveSchema = z.object({
  type: z.enum(["annual", "sick", "unpaid", "compassionate", "other"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().min(1, "Reason is required"),
});

type LeaveFormValues = z.infer<typeof leaveSchema>;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export default function EmployeeLeave() {
  const queryClient = useQueryClient();
  const { data: balance } = useGetMyLeaveBalance();
  const { data: requests, isLoading } = useListMyLeaveRequests();
  useNotificationFocus(!!requests);
  const createLeave = useCreateLeaveRequest();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<
    NonNullable<typeof requests>[number] | null
  >(null);

  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      type: "annual",
      startDate: "",
      endDate: "",
      reason: "",
    },
  });

  const handleOpen = () => {
    form.reset({ type: "annual", startDate: "", endDate: "", reason: "" });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: LeaveFormValues) => {
    createLeave.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyLeaveRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyLeaveBalanceQueryKey() });
          toast.success("Leave request submitted");
          setIsDialogOpen(false);
        },
        onError: (err) => {
          toast.error("Failed to submit leave request", {
            description: err.data?.error || "Unknown error",
          });
        },
      }
    );
  };

  const stats = [
    { label: "Allocation", value: balance?.allocation ?? 0 },
    { label: "Used", value: balance?.used ?? 0 },
    { label: "Remaining", value: balance?.remaining ?? 0 },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Palmtree className="h-7 w-7 text-muted-foreground" />
            Leave
          </h1>
          <p className="text-muted-foreground mt-1">Request time off and track your balance.</p>
        </div>
        <Button onClick={handleOpen}>
          <Plus className="h-4 w-4 mr-2" />
          Request Leave
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">{s.value}</span>
              <span className="text-sm text-muted-foreground ml-1">days</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Leave History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full"></div>
            </div>
          ) : !requests || requests.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">No leave requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow
                    key={r.id}
                    id={`focus-${r.id}`}
                    className="cursor-pointer"
                    onClick={() => setDetailTarget(r)}
                  >
                    <TableCell className="capitalize">{r.type}</TableCell>
                    <TableCell>
                      {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{r.days}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(r.status)}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.reviewNote || "—"}</TableCell>
                  </TableRow>
                ))}
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
                <span className="capitalize font-medium">{detailTarget.type} leave</span>
                <Badge variant="outline" className={statusBadgeClass(detailTarget.status)}>
                  {detailTarget.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p>
                    {new Date(detailTarget.startDate).toLocaleDateString()} –{" "}
                    {new Date(detailTarget.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days</p>
                  <p>{detailTarget.days}</p>
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Leave Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="sick">Sick</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="compassionate">Compassionate</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Reason for leave" className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLeave.isPending}>
                  Submit Request
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
