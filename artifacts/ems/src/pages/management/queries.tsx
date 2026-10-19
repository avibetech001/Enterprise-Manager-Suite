import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListEmployeesQueryKey,
  getListQueriesQueryKey,
  useCreateQuery,
  useDeleteQuery,
  useListEmployees,
  useListQueries,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileWarning, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type QueryCategory = "query" | "deduction" | "fine";

const CATEGORY_LABEL: Record<QueryCategory, string> = {
  query: "Query",
  deduction: "Deduction",
  fine: "Fine",
};

export default function ManagementQueriesPage() {
  const queryClient = useQueryClient();
  const { data: employees, isLoading: employeesLoading } = useListEmployees(
    {},
    { query: { queryKey: getListEmployeesQueryKey({}) } },
  );
  const { data: queries, isLoading: queriesLoading } = useListQueries(undefined, {
    query: { queryKey: getListQueriesQueryKey() },
  });
  const activeEmployees = useMemo(
    () =>
      (employees || []).filter(
        (employee) => employee.accountStatus === "active" && !employee.archived,
      ),
    [employees],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [category, setCategory] = useState<QueryCategory>("query");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const createQuery = useCreateQuery();
  const deleteQuery = useDeleteQuery();

  const resetForm = () => {
    setEmployeeId("");
    setCategory("query");
    setAmount("");
    setReason("");
  };

  const submitQuery = () => {
    const userId = Number(employeeId);
    if (!userId) {
      toast.error("Choose an employee.");
      return;
    }
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
          userId,
          category,
          amount: category === "query" ? null : amount.trim(),
          reason: reason.trim(),
        },
      },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListQueriesQueryKey() });
          const sent = [
            result.emailSent ? "email" : null,
            result.privateChatSent ? "private chat" : null,
          ].filter(Boolean);
          if (sent.length === 2) {
            toast.success(`${CATEGORY_LABEL[category]} issued and sent by email and private chat.`);
          } else {
            const failed = [
              !result.emailSent ? "email" : null,
              !result.privateChatSent ? "private chat" : null,
            ].filter(Boolean);
            toast.warning(`${CATEGORY_LABEL[category]} issued, but delivery needs attention.`, {
              description: `Failed delivery: ${failed.join(" and ")}. The notice remains saved.`,
            });
          }
          setDialogOpen(false);
          resetForm();
        },
        onError: (error) =>
          toast.error("Failed to issue notice", {
            description:
              (error as { data?: { error?: string } })?.data?.error ||
              "Please try again.",
          }),
      },
    );
  };

  const removeQuery = (id: number) => {
    if (!confirm("Delete this query record?")) return;
    deleteQuery.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQueriesQueryKey() });
          toast.success("Query record deleted.");
        },
        onError: () => toast.error("Could not delete query record."),
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <FileWarning className="h-7 w-7 text-muted-foreground" />
            Employee Queries
          </h1>
          <p className="mt-1 text-muted-foreground">
            Issue a notice to an employee and send it to their email and private chat.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Issue notice
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issued notices</CardTitle>
        </CardHeader>
        <CardContent>
          {queriesLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading notices…</p>
          ) : !queries?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No queries, deductions, or fines have been issued.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Issued by</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queries.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap font-medium">{item.employeeName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_LABEL[item.category as QueryCategory] || item.category}</Badge>
                      </TableCell>
                      <TableCell className="min-w-56 whitespace-pre-wrap">{item.reason}</TableCell>
                      <TableCell>{item.amount || "—"}</TableCell>
                      <TableCell>{item.issuedByName || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Delete query"
                          onClick={() => removeQuery(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="query-employee">Employee</Label>
              <select
                id="query-employee"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                disabled={employeesLoading}
              >
                <option value="">Select an active employee</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.fullName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="query-category">Notice type</Label>
              <select
                id="query-category"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value as QueryCategory)}
              >
                <option value="query">Query</option>
                <option value="deduction">Deduction</option>
                <option value="fine">Fine</option>
              </select>
            </div>
            {category !== "query" && (
              <div className="space-y-2">
                <Label htmlFor="query-amount">Amount</Label>
                <Input
                  id="query-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Amount"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="query-reason">Reason</Label>
              <Textarea
                id="query-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={5}
                placeholder="Explain the reason for this notice"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitQuery} disabled={createQuery.isPending}>
              {createQuery.isPending ? "Sending…" : "Issue and send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
