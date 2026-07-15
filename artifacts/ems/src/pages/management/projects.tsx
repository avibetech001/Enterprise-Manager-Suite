import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useListEmployees,
  getListProjectsQueryKey,
  ProjectDetail,
  ProjectInput,
  ProjectInputStatus,
  ProjectDeliverableInput,
  ProjectDeliverableInputStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, FolderKanban, Users, CalendarClock, ListChecks, Crown } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS: ProjectInputStatus[] = ["planning", "active", "on_hold", "completed"];
const DELIVERABLE_STATUS: ProjectDeliverableInputStatus[] = ["pending", "in_progress", "done"];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    on_hold: "bg-red-50 text-red-700 border-red-200",
    planning: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={`capitalize ${map[status] || map.planning}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}

interface FormState {
  name: string;
  description: string;
  status: ProjectInputStatus;
  startDate: string;
  deadline: string;
  progress: number;
  leadUserId: number | null;
  memberIds: number[];
  deliverables: ProjectDeliverableInput[];
}

const emptyForm: FormState = {
  name: "",
  description: "",
  status: "planning",
  startDate: "",
  deadline: "",
  progress: 0,
  leadUserId: null,
  memberIds: [],
  deliverables: [],
};

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useListProjects();
  const { data: employees } = useListEmployees();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const activeEmployees = employees?.filter((e) => e.accountStatus === "active" && !e.archived) ?? [];

  const openDialog = (project?: ProjectDetail) => {
    if (project) {
      setEditing(project);
      setForm({
        name: project.name,
        description: project.description || "",
        status: (STATUS_OPTIONS.includes(project.status as ProjectInputStatus)
          ? project.status
          : "planning") as ProjectInputStatus,
        startDate: project.startDate || "",
        deadline: project.deadline || "",
        progress: project.progress,
        leadUserId: project.leadUserId ?? null,
        memberIds: project.members.map((m) => m.userId),
        deliverables: project.deliverables.map((d) => ({
          title: d.title,
          dueDate: d.dueDate || undefined,
          status: (DELIVERABLE_STATUS.includes(d.status as ProjectDeliverableInputStatus)
            ? d.status
            : "pending") as ProjectDeliverableInputStatus,
        })),
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setIsDialogOpen(true);
  };

  const toggleMember = (userId: number, checked: boolean) => {
    setForm((f) => ({
      ...f,
      memberIds: checked ? [...f.memberIds, userId] : f.memberIds.filter((id) => id !== userId),
    }));
  };

  const addDeliverable = () => {
    setForm((f) => ({
      ...f,
      deliverables: [...f.deliverables, { title: "", dueDate: undefined, status: "pending" }],
    }));
  };

  const updateDeliverable = (index: number, patch: Partial<ProjectDeliverableInput>) => {
    setForm((f) => ({
      ...f,
      deliverables: f.deliverables.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  };

  const removeDeliverable = (index: number) => {
    setForm((f) => ({ ...f, deliverables: f.deliverables.filter((_, i) => i !== index) }));
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    const payload: ProjectInput = {
      name: form.name.trim(),
      description: form.description || undefined,
      status: form.status,
      startDate: form.startDate || undefined,
      deadline: form.deadline || undefined,
      progress: form.progress,
      leadUserId: form.leadUserId,
      memberIds: form.memberIds,
      deliverables: form.deliverables
        .filter((d) => d.title.trim())
        .map((d) => ({ title: d.title.trim(), dueDate: d.dueDate || undefined, status: d.status })),
    };

    if (editing) {
      updateProject.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            invalidate();
            toast.success("Project updated");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to update project", { description: error.data?.error || "Unknown error occurred" });
          },
        }
      );
    } else {
      createProject.mutate(
        { data: payload },
        {
          onSuccess: () => {
            invalidate();
            toast.success("Project created");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to create project", { description: (error as { data?: { error?: string } })?.data?.error || "Unknown error occurred" });
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    deleteProject.mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Project deleted");
        },
        onError: (error) => {
          toast.error("Failed to delete project", { description: (error as { data?: { error?: string } })?.data?.error || "Unknown error occurred" });
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Track projects, members, and deliverables.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-1/2 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openDialog(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mb-3">{statusBadge(p.status)}</div>
                {p.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{p.description}</p>
                )}
                <div className="mt-auto space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} />
                  </div>
                  {p.leadName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Crown className="h-3.5 w-3.5" />
                      Lead: <span className="font-medium text-foreground">{p.leadName}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {p.deadline || "No deadline"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {p.members.length} {p.members.length === 1 ? "member" : "members"}
                    </span>
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" />
                      {p.deliverables.length} deliverables
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg bg-card">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No projects yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Get started by creating your first project.</p>
          <Button variant="outline" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Project name"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Project description"
                className="resize-none"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Status, progress, and deliverable progress are updated by the assigned employees.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project Lead</Label>
              <Select
                value={form.leadUserId !== null ? String(form.leadUserId) : "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, leadUserId: v === "none" ? null : Number(v) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No lead assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead</SelectItem>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Members</Label>
              <ScrollArea className="h-40 rounded-md border p-3">
                {activeEmployees.length > 0 ? (
                  <div className="space-y-2">
                    {activeEmployees.map((emp) => (
                      <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={form.memberIds.includes(emp.id)}
                          onCheckedChange={(c) => toggleMember(emp.id, c === true)}
                        />
                        <span>
                          {emp.fullName}{" "}
                          <span className="text-muted-foreground font-mono text-xs">{emp.employeeCode}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active employees.</p>
                )}
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Deliverables</Label>
                <Button type="button" variant="outline" size="sm" onClick={addDeliverable}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {form.deliverables.length === 0 && (
                  <p className="text-sm text-muted-foreground">No deliverables added.</p>
                )}
                {form.deliverables.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={d.title}
                      onChange={(e) => updateDeliverable(i, { title: e.target.value })}
                      placeholder="Deliverable title"
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      value={d.dueDate || ""}
                      onChange={(e) => updateDeliverable(i, { dueDate: e.target.value || undefined })}
                      className="w-[150px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeDeliverable(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createProject.isPending || updateProject.isPending}>
              {editing ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
