import { useGetCurrentSession, useListEmployees, useListDepartments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, CheckCircle2 } from "lucide-react";

export default function ManagementDashboard() {
  const { data: session } = useGetCurrentSession();
  const { data: employees } = useListEmployees();
  const { data: departments } = useListDepartments();

  if (!session) return null;

  const activeEmployees = employees?.filter(e => e.accountStatus === 'active')?.length || 0;
  const pendingEmployees = employees?.filter(e => e.accountStatus === 'pending')?.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Welcome to the 5th Element management dashboard.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeEmployees} active, {pendingEmployees} pending
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{departments?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Active teams</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">Operational</div>
            <p className="text-xs text-muted-foreground mt-1">All services online</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
