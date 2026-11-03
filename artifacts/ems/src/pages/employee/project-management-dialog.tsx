import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMyProjectsQueryKey,
  useCreateMyProject,
  useUpdateProject,
  type ProjectDetail,
  type ProjectDeliverableInput,
  type ProjectDeliverableInputStatus,
  type ProjectInput,
  type ProjectInputStatus,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const PROJECT_STATUSES: ProjectInputStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
];
const DELIVERABLE_STATUSES: ProjectDeliverableInputStatus[] = [
  "pending",
  "in_progress",
  "done",
];

type ProjectForm = {
  name: string;
  description: string;
  status: ProjectInputStatus;
  startDate: string;
  deadline: string;
  progress: string;
  urgent: boolean;
  leadUserId: number | null;
  memberIds: number[];
  deliverables: ProjectDeliverableInput[];
};

function createForm(
  project: ProjectDetail | null,
  currentUserId: number | null,
): ProjectForm {
  if (!project) {
    return {
      name: "",
      description: "",
      status: "planning",
      startDate: "",
      deadline: "",
      progress: "0",
      urgent: false,
      leadUserId: currentUserId,
      memberIds: currentUserId === null ? [] : [currentUserId],
      deliverables: [],
    };
  }
  return {
    name: project.name,
    description: project.description ?? "",
    status: project.status as ProjectInputStatus,
    startDate: project.startDate ?? "",
    deadline: project.deadline ?? "",
    progress: String(project.progress),
    urgent: project.urgent,
    leadUserId: project.leadUserId,
    memberIds: Array.from(
      new Set([
        ...project.members.map((member) => member.userId),
        ...(project.leadUserId === null ? [] : [project.leadUserId]),
      ]),
    ),
    deliverables: project.deliverables.map((deliverable) => ({
      title: deliverable.title,
      dueDate: deliverable.dueDate ?? undefined,
      status: deliverable.status as ProjectDeliverableInputStatus,
    })),
  };
}

export function ProjectManagementDialog({
  open,
  onOpenChange,
  project,
  currentUserId,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail | null;
  currentUserId: number | null;
  people: Array<{ id: number; fullName: string }>;
}) {
  const queryClient = useQueryClient();
  const createProject = useCreateMyProject();
  const updateProject = useUpdateProject();
  const [form, setForm] = useState(() => createForm(project, currentUserId));

  useEffect(() => {
    if (open) setForm(createForm(project, currentUserId));
  }, [open, project, currentUserId]);

  const updateDeliverable = (
    index: number,
    patch: Partial<ProjectDeliverableInput>,
  ) => {
    setForm((current) => ({
      ...current,
      deliverables: current.deliverables.map((deliverable, itemIndex) =>
        itemIndex === index ? { ...deliverable, ...patch } : deliverable,
      ),
    }));
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Project name is required.");
      return;
    }
    const progress = Number(form.progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      toast.error("Progress must be a whole number from 0 to 100.");
      return;
    }
    const data: ProjectInput = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      startDate: form.startDate || undefined,
      deadline: form.deadline || undefined,
      progress,
      urgent: form.urgent,
      leadUserId: project ? form.leadUserId : currentUserId,
      memberIds: form.memberIds,
      deliverables: form.deliverables
        .filter((deliverable) => deliverable.title.trim())
        .map((deliverable) => ({
          title: deliverable.title.trim(),
          dueDate: deliverable.dueDate || undefined,
          status: deliverable.status ?? "pending",
        })),
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
      toast.success(project ? "Project updated" : "Project started");
      onOpenChange(false);
    };
    const onError = (error: { data?: { error?: string } | null }) => {
      toast.error(project ? "Could not update project" : "Could not start project", {
        description: error.data?.error || "Please try again.",
      });
    };
    if (project) {
      updateProject.mutate({ id: project.id, data }, { onSuccess, onError });
    } else {
      createProject.mutate({ data }, { onSuccess, onError });
    }
  };

  const isSaving = createProject.isPending || updateProject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Manage Project" : "Start a New Project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employee-project-name">Name</Label>
            <Input
              id="employee-project-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Project name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-project-description">Description</Label>
            <Textarea
              id="employee-project-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="What is this project about?"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as ProjectInputStatus,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="capitalize">{status.replace("_", " ")}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-project-progress">Progress (%)</Label>
              <Input
                id="employee-project-progress"
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.progress}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    progress: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="employee-project-start">Start date</Label>
              <Input
                id="employee-project-start"
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-project-deadline">Deadline</Label>
              <Input
                id="employee-project-deadline"
                type="date"
                value={form.deadline}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deadline: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={form.urgent}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, urgent: checked === true }))
              }
            />
            Mark as urgent
          </label>
          {project ? (
            <div className="space-y-2">
              <Label>Project lead</Label>
              <Select
                value={form.leadUserId === null ? "none" : String(form.leadUserId)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    leadUserId: value === "none" ? null : Number(value),
                    memberIds:
                      value === "none"
                        ? current.memberIds
                        : Array.from(
                            new Set([...current.memberIds, Number(value)]),
                          ),
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={String(person.id)}>
                      {person.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              You will be the project lead. Management can change the lead later.
            </p>
          )}
          <div className="space-y-2">
            <Label>Project members</Label>
            <ScrollArea className="h-36 rounded-md border p-3">
              <div className="space-y-2">
                {people.map((person) => (
                  <label
                    key={person.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={form.memberIds.includes(person.id)}
                      disabled={person.id === form.leadUserId}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          memberIds:
                            checked === true
                              ? Array.from(new Set([...current.memberIds, person.id]))
                              : current.memberIds.filter((id) => id !== person.id),
                        }))
                      }
                    />
                    {person.fullName}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Deliverables</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    deliverables: [
                      ...current.deliverables,
                      { title: "", status: "pending" },
                    ],
                  }))
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            {form.deliverables.length === 0 && (
              <p className="text-sm text-muted-foreground">No deliverables added.</p>
            )}
            {form.deliverables.map((deliverable, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  value={deliverable.title}
                  onChange={(event) =>
                    updateDeliverable(index, { title: event.target.value })
                  }
                  placeholder="Deliverable title"
                  className="min-w-32 flex-1"
                />
                <Input
                  type="date"
                  value={deliverable.dueDate ?? ""}
                  onChange={(event) =>
                    updateDeliverable(index, {
                      dueDate: event.target.value || undefined,
                    })
                  }
                  className="w-40"
                />
                <Select
                  value={deliverable.status ?? "pending"}
                  onValueChange={(value) =>
                    updateDeliverable(index, {
                      status: value as ProjectDeliverableInputStatus,
                    })
                  }
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERABLE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        <span className="capitalize">{status.replace("_", " ")}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove deliverable"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      deliverables: current.deliverables.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving}>
            {isSaving
              ? "Saving..."
              : project
                ? "Save Changes"
                : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
