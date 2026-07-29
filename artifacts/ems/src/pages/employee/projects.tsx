import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyProjects,
  useUpdateMyProjectProgress,
  useSubmitMyProject,
  useDeleteMyProjectSubmission,
  useCreateMyProject,
  useGetCurrentSession,
  getListMyProjectsQueryKey,
  type ProjectDetail,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUpload } from "@workspace/object-storage-web";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FolderKanban, CalendarDays, Pencil, X, Upload, FileCheck2, Plus } from "lucide-react";

const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed"] as const;
const DELIVERABLE_STATUSES = ["pending", "in_progress", "done"] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "on_hold":
      return "bg-amber-50 text-amber-700 border-amber-200";
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
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function SubmitWorkSection({ project: p }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const submitProject = useSubmitMyProject();
  const deleteSubmission = useDeleteMyProjectSubmission();

  const handleDelete = () => {
    if (!window.confirm("Remove your submitted work from this project?")) return;
    deleteSubmission.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          toast.success("Submission removed");
          setShowForm(false);
        },
        onError: (err: any) => {
          toast.error("Failed to remove submission", { description: err?.data?.error || "Unknown error" });
        },
      },
    );
  };
  const [showForm, setShowForm] = useState(false);
  const [uploaded, setUploaded] = useState<{ objectPath: string; fileName: string } | null>(null);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const { uploadFile, isUploading } = useUpload({
    onError: (err) => toast.error("Upload failed", { description: err.message }),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    if (res) setUploaded({ objectPath: res.objectPath, fileName: file.name });
  };

  const handleSubmit = () => {
    const trimmedLink = link.trim();
    if (!uploaded && !trimmedLink) {
      toast.error("Please upload a file or paste a link first.");
      return;
    }
    if (trimmedLink && !/^https?:\/\//i.test(trimmedLink)) {
      toast.error("Link must start with http:// or https://");
      return;
    }
    submitProject.mutate(
      {
        id: p.id,
        data: {
          objectPath: uploaded?.objectPath,
          fileName: uploaded?.fileName,
          link: trimmedLink || undefined,
          note: note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          toast.success("Project work submitted");
          setShowForm(false);
          setUploaded(null);
          setLink("");
          setNote("");
        },
        onError: (err: any) => {
          toast.error("Failed to submit project", { description: err?.data?.error || "Unknown error" });
        },
      },
    );
  };

  return (
    <>
      <Separator />
      {p.submittedAt ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1 dark:bg-emerald-950/30 dark:border-emerald-900">
          <p className="text-sm font-medium flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <FileCheck2 className="h-4 w-4" />
            Work submitted {new Date(p.submittedAt).toLocaleDateString()}
          </p>
          {p.submissionFileName && (
            <p className="text-xs text-muted-foreground">File: {p.submissionFileName}</p>
          )}
          {p.submissionLink && (
            <a
              href={p.submissionLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-700 dark:text-emerald-400 underline break-all block"
            >
              {p.submissionLink}
            </a>
          )}
          {p.submissionNote && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.submissionNote}</p>
          )}
          {!showForm && (
            <div className="flex flex-wrap gap-2 mt-1">
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Replace submission
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleteSubmission.isPending}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove submission
              </Button>
            </div>
          )}
        </div>
      ) : (
        !showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload & Submit Work
          </Button>
        )
      )}
      {showForm && (
        <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
          <div className="space-y-1.5">
            <Label htmlFor={`file-${p.id}`} className="text-xs">Project file</Label>
            <Input id={`file-${p.id}`} type="file" onChange={handleFileChange} disabled={isUploading} className="h-9" />
            {isUploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {uploaded && !isUploading && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <FileCheck2 className="h-3.5 w-3.5" /> {uploaded.fileName} ready
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`link-${p.id}`} className="text-xs">Website link (optional)</Label>
            <Input
              id={`link-${p.id}`}
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com/your-work"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`note-${p.id}`} className="text-xs">Note (optional)</Label>
            <Textarea
              id={`note-${p.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything management should know about this submission"
              className="resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitProject.isPending || isUploading || (!uploaded && !link.trim())}
            >
              Submit Work
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectCard({ project: p }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const updateProgress = useUpdateMyProjectProgress();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(p.status);
  const [progress, setProgress] = useState(String(p.progress));
  const [deliverableStatuses, setDeliverableStatuses] = useState<Record<number, string>>({});

  const startEditing = () => {
    setStatus(p.status);
    setProgress(String(p.progress));
    setDeliverableStatuses(Object.fromEntries(p.deliverables.map((d) => [d.id, d.status])));
    setEditing(true);
  };

  const handleSave = () => {
    const progressNum = Number(progress);
    if (Number.isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
      toast.error("Progress must be between 0 and 100.");
      return;
    }
    updateProgress.mutate(
      {
        id: p.id,
        data: {
          status: status as (typeof PROJECT_STATUSES)[number],
          progress: Math.round(progressNum),
          deliverables: p.deliverables.map((d) => ({
            id: d.id,
            status: (deliverableStatuses[d.id] ?? d.status) as (typeof DELIVERABLE_STATUSES)[number],
          })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          toast.success("Project progress updated");
          setEditing(false);
        },
        onError: (err) => {
          toast.error("Failed to update progress", { description: err.data?.error || "Unknown error" });
        },
      }
    );
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${p.urgent ? "bg-red-500" : "bg-yellow-400"}`}
              title={p.urgent ? "Urgent" : "Not urgent"}
              aria-label={p.urgent ? "Urgent project" : "Not urgent"}
            />
            {p.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusBadgeClass(p.status)}>
              <span className="capitalize">{p.status.replace("_", " ")}</span>
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => (editing ? setEditing(false) : startEditing())}
              aria-label={editing ? "Cancel editing" : "Update progress"}
            >
              {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}

        {editing ? (
          <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        <span className="capitalize">{s.replace("_", " ")}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`progress-${p.id}`} className="text-xs">Progress (%)</Label>
                <Input
                  id={`progress-${p.id}`}
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            {p.deliverables.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Deliverables</Label>
                {p.deliverables.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <p className="text-sm truncate">{d.title}</p>
                    <Select
                      value={deliverableStatuses[d.id] ?? d.status}
                      onValueChange={(v) =>
                        setDeliverableStatuses((prev) => ({ ...prev, [d.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERABLE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <span className="capitalize">{s.replace("_", " ")}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
            <Button size="sm" onClick={handleSave} disabled={updateProgress.isPending}>
              Save Update
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{p.progress}%</span>
            </div>
            <Progress value={p.progress} />
          </div>
        )}

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
          {p.leadName && (
            <span className="flex items-center gap-1.5">
              Lead: <span className="font-medium text-foreground">{p.leadName}</span>
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

        {!editing && p.deliverables.length > 0 && (
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

        <SubmitWorkSection project={p} />
      </CardContent>
    </Card>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");

  const createProject = useCreateMyProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
        toast.success("Project started", {
          description: "Your new project has been created.",
        });
        setName("");
        setDescription("");
        setStartDate("");
        setDeadline("");
        onOpenChange(false);
      },
      onError: (err: any) => {
        toast.error("Couldn't start project", {
          description: err?.response?.data?.error || "Please try again.",
        });
      },
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    createProject.mutate({
      data: {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(startDate ? { startDate } : {}),
        ...(deadline ? { deadline } : {}),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-name">Project name</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client onboarding videos"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-desc">Description (optional)</Label>
            <Textarea
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="np-start">Start date</Label>
              <Input
                id="np-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-deadline">Deadline</Label>
              <Input
                id="np-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            You will be the project lead. Management can add more team members later.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createProject.isPending}>
            {createProject.isPending ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeeProjects() {
  const { data: projects, isLoading } = useListMyProjects();
  const { data: session } = useGetCurrentSession();
  const canCreate = session?.user?.canCreateProjects === true;
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  useNotificationFocus(!!projects);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="h-7 w-7 text-muted-foreground" />
            My Projects
          </h1>
          <p className="text-muted-foreground mt-1">
            Projects you are assigned to. Update the status, progress, and deliverables as you work.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setNewProjectOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Button>
        )}
      </div>
      {canCreate && (
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      )}

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
            <div key={p.id} id={`focus-${p.id}`}>
              <ProjectCard project={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
