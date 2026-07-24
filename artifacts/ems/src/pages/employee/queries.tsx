import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useListMyQueries } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileWarning } from "lucide-react";

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "deduction":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "fine":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

export default function EmployeeQueries() {
  const { data: queries, isLoading } = useListMyQueries();
  useNotificationFocus(!!queries);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileWarning className="h-7 w-7 text-muted-foreground" />
          My Queries
        </h1>
        <p className="text-muted-foreground mt-1">
          Queries, deductions, and fines issued to you by management.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Issued Queries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full"></div>
            </div>
          ) : !queries || queries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No queries have been issued to you.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Issued By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queries.map((q) => (
                  <TableRow key={q.id} id={`focus-${q.id}`}>
                    <TableCell>
                      <Badge variant="outline" className={categoryBadgeClass(q.category)}>
                        {q.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap">{q.reason}</TableCell>
                    <TableCell>{q.amount || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {q.issuedByName || "—"}
                    </TableCell>
                    <TableCell>{new Date(q.createdAt).toLocaleDateString()}</TableCell>
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
