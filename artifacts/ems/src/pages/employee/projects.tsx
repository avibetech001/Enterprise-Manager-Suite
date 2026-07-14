import { useListMyProjects } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { FolderKanban, CalendarDays } from "lucide-react";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "completed":
      return "bg-muted text-muted-foreground border-border";
    case "on_hold":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "planning":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function deliverableBadgeClass(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "in_progress":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "pending":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export default function EmployeeProjects() {
  const { data: projects, isLoading } = useListMyProjects();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FolderKanban className="h-7 w-7 text-muted-foreground" />
          My Projects
        </h1>
        <p className="text-muted-foreground mt-1">Projects you are assigned to.</p>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No projects assigned</h3>
          <p className="text-muted-foreground text-sm mt-1">
            You are not currently assigned to any projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  <Badge variant="outline" className={statusBadgeClass(p.status)}>
                    <span className="capitalize">{p.status.replace("_", " ")}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {p.description && (
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{p.progress}%</span>
                  </div>
                  <Progress value={p.progress} />
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {p.startDate && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Start: {new Date(p.startDate).toLocaleDateString()}
                    </span>
                  )}
                  {p.deadline && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Deadline: {new Date(p.deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {p.members.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Team</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-1.5">
                          <Avatar className="h-7 w-7 border border-border">
                            <AvatarFallback className="text-xs">{initials(m.fullName)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{m.fullName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {p.deliverables.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Deliverables</p>
                      <div className="space-y-2">
                        {p.deliverables.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm truncate">{d.title}</p>
                              {d.dueDate && (
                                <p className="text-xs text-muted-foreground">
                                  Due {new Date(d.dueDate).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className={deliverableBadgeClass(d.status)}>
                              <span className="capitalize">{d.status.replace("_", " ")}</span>
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
