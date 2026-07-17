import { useMemo, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDepartments,
  useListEmployees,
  useUpdateEmployee,
  useListQueries,
  useCreateQuery,
  useDeleteQuery,
  getListQueriesQueryKey,
  getListEmployeesQueryKey,
  type Employee,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Building2, Gavel, Trash2, Users, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CATEGORY_LABEL: Record<string, string> = {
  query: "Query",
  deduction: "Deduction",
  fine: "Fine",
};

export default function DepartmentDetailPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: departments, isLoading: deptLoading } = useListDepartments();
  const { data: employees, isLoading: empLoading } = useListEmployees();
  const department = departments?.find((d) => d.id === id);

  const members = useMemo(
    () =>
      (employees || []).filter(
        (e) => e.employment.departmentId === id && !e.archived,
      ),
    [employees, id],
  );
  const memberUserIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const updateEmployee = useUpdateEmployee();
  const [addUserId, setAddUserId] = useState<string>("");
  const nonMembers = useMemo(
    () =>
      (employees || []).filter(
        (e) =>
          e.employment.departmentId !== id && !e.archived,
      ),
    [employees, id],
  );

  const invalidateEmployees = () =>
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });

  const handleAddMember = () => {
    const userId = Number(addUserId);
    if (!userId) return;
    updateEmployee.mutate(
      { id: userId, data: { departmentId: id } },
      {
        onSuccess: () => {
          invalidateEmployees();
          setAddUserId("");
          toast.success("Member added to department");
        },
        onError: (err) =>
          toast.error("Failed to add member", {
            description: err.data?.error || "Unknown error",
          }),
      },
    );
  };

  const handleRemoveMember = (emp: Employee) => {
    if (!window.confirm(`Remove ${emp.fullName} from this department?`)) return;
    updateEmployee.mutate(
      { id: emp.id, data: { departmentId: null } },
      {
        onSuccess: () => {
          invalidateEmployees();
          toast.success("Member removed from department");
        },
        onError: (err) =>
          toast.error("Failed to remove member", {
            description: err.data?.error || "Unknown error",
          }),
      },
    );
  };

  const queriesKey = getListQueriesQueryKey();
  const { data: allQueries, isLoading: queriesLoading } = useListQueries(undefined, {
    query: { queryKey: queriesKey },
  });
  const deptQueries = (allQueries || []).filter((q) => memberUserIds.has(q.userId));

  const createQuery = useCreateQuery();
  const deleteQuery = useDeleteQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetEmployee, setTargetEmployee] = useState<Employee | null>(null);
  const [category, setCategory] = useState<"query" | "deduction" | "fine">("query");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const openQueryDialog = (emp: Employee) => {
    setTargetEmployee(emp);
    setCategory("query");
    setAmount("");
    setReason("");
    setDialogOpen(true);
  };

  const submitQuery = () => {
    if (!targetEmployee) return;
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    if ((category === "deduction" || category === "fine") && !amount.trim()) {
      toast.error("An amount is required for deductions and fines.");
      return;
    }
    createQuery.mutate(
      {
        data: {
          userId: targetEmployee.id,
          category,
          amount: category === "query" ? null : amount.trim(),
          reason: reason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success(`${CATEGORY_LABEL[category]} issued to ${targetEmployee.fullName}.`);
          setDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: queriesKey });
        },
        onError: (error) =>
          toast.error("Failed to issue query", {
            description:
              (error as { data?: { error?: string } })?.data?.error ||
              "Unknown error occurred",
          }),
      },
    );
  };

  const removeQuery = (queryId: number) => {
    if (!confirm("Delete this query record?")) return;
    deleteQuery.mutate(
      { id: queryId },
      {
        onSuccess: () => {
          toast.success("Query deleted.");
          queryClient.invalidateQueries({ queryKey: queriesKey });
        },
        onError: () => toast.error("Failed to delete query."),
      },
    );
  };

  if (!deptLoading && !department) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => setLocation("/departments")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Departments
        </Button>
        <div className="text-center py-12 text-muted-foreground">Department not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button variant="ghost" className="mb-2 -ml-2" onClick={() => setLocation("/departments")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Departments
        </Button>
        {deptLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-7 w-7 text-muted-foreground" />
              {department?.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {department?.description || "No description provided."}
            </p>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Members ({members.length})
          </CardTitle>
          <CardDescription>
            Employees assigned to this department. Members are automatically part of this department's group chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Select value={addUserId} onValueChange={setAddUserId}>
              <SelectTrigger className="sm:max-w-xs">
                <SelectValue placeholder="Select an employee to add" />
              </SelectTrigger>
              <SelectContent>
                {nonMembers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No employees available to add
                  </div>
                ) : (
                  nonMembers.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.fullName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddMember}
              disabled={!addUserId || updateEmployee.isPending}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              Add Member
            </Button>
          </div>
          {empLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No employees in this department yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee Code</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <Link
                        href={`/employees/${emp.id}`}
                        className="font-medium hover:underline"
                      >
                        {emp.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {emp.employeeCode || "—"}
                    </TableCell>
                    <TableCell>{emp.employment.jobTitle || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {emp.employment.employmentStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openQueryDialog(emp)}>
                          <Gavel className="h-4 w-4 mr-1.5" /> Issue Query
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateEmployee.isPending}
                          onClick={() => handleRemoveMember(emp)}
                        >
                          <UserMinus className="h-4 w-4 mr-1.5" /> Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" /> Queries & Deductions
          </CardTitle>
          <CardDescription>
            Disciplinary queries, deductions and fines issued to members of this department.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queriesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : deptQueries.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No queries issued yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Issued By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deptQueries.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.employeeName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={q.category === "query" ? "secondary" : "destructive"}
                        className="capitalize"
                      >
                        {CATEGORY_LABEL[q.category] || q.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{q.amount ? `₦${q.amount}` : "—"}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2 text-sm">{q.reason}</span>
                    </TableCell>
                    <TableCell>{q.issuedByName || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(q.createdAt), "PP")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeQuery(q.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Query — {targetEmployee?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="query">Query (warning)</SelectItem>
                  <SelectItem value="deduction">Deduction</SelectItem>
                  <SelectItem value="fine">Fine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {category !== "query" && (
              <div className="space-y-2">
                <Label htmlFor="query-amount">Amount (₦)</Label>
                <Input
                  id="query-amount"
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="5000"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="query-reason">Reason</Label>
              <Textarea
                id="query-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Explain why this employee is being queried..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitQuery} disabled={createQuery.isPending}>
              Issue {CATEGORY_LABEL[category]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
