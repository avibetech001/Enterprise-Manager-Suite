import { useListDepartments } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

export default function EmployeeDepartmentsPage() {
  const { data: departments, isLoading } = useListDepartments();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-7 w-7 text-muted-foreground" />
          Departments
        </h1>
        <p className="text-muted-foreground mt-1">
          The organizational units and teams in your company.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (departments || []).length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No departments yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Your company hasn't set up departments yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments?.map((dept) => (
            <Card key={dept.id} className="flex flex-col">
              <CardContent className="p-6 flex-1 flex flex-col">
                <h3 className="font-semibold text-lg mb-2">{dept.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">
                  {dept.description || "No description provided."}
                </p>
                <div className="text-xs font-medium bg-muted/50 px-3 py-1.5 rounded-md inline-flex self-start mb-3">
                  {dept.employeeCount} {dept.employeeCount === 1 ? "member" : "members"}
                </div>
                {dept.members.length > 0 && (
                  <ul className="space-y-1.5">
                    {dept.members.map((m) => (
                      <li key={m.id} className="text-sm flex items-baseline justify-between gap-2">
                        <span className="font-medium">{m.fullName}</span>
                        {m.jobTitle && (
                          <span className="text-xs text-muted-foreground text-right">{m.jobTitle}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
