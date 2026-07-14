import { useGetCurrentSession } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function EmployeeDashboard() {
  const { data: session } = useGetCurrentSession();

  if (!session) return null;

  const user = session.user;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.fullName.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-1">Here is your employee profile overview.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your personal details on file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Full Name</span>
              <span className="text-sm font-medium">{user.fullName}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Email Address</span>
              <span className="text-sm font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Phone Number</span>
              <span className="text-sm font-medium">{user.phone}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Account Status</span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {user.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company Overview</CardTitle>
            <CardDescription>Your organization details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Organization</span>
              <span className="text-sm font-medium">{session.company.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Contact Email</span>
              <span className="text-sm font-medium">{session.company.email}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Support Phone</span>
              <span className="text-sm font-medium">{session.company.phone}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
