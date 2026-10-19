import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListChatGroupsQueryKey,
  getListManagedChatTeamsQueryKey,
  useCreateManagedChatTeam,
  useDeleteManagedChatTeam,
  useListTeamChatEmployees,
  useListManagedChatTeams,
  useUpdateManagedChatTeam,
  type ManagedChatTeam,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquarePlus, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

function apiError(error: unknown): string {
  return (
    (error as { data?: { error?: string } })?.data?.error ||
    "Please try again."
  );
}

export default function TeamChatManagementPage() {
  const queryClient = useQueryClient();
  const { data: teams, isLoading } = useListManagedChatTeams({
    query: {
      queryKey: getListManagedChatTeamsQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const { data: employeeRows } = useListTeamChatEmployees();
  const createTeam = useCreateManagedChatTeam();
  const updateTeam = useUpdateManagedChatTeam();
  const deleteTeam = useDeleteManagedChatTeam();

  const employees = useMemo(
    () => employeeRows || [],
    [employeeRows],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<ManagedChatTeam | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberUserIds, setMemberUserIds] = useState<number[]>([]);
  const [teamLeadUserId, setTeamLeadUserId] = useState("");

  const invalidateTeamData = () => {
    queryClient.invalidateQueries({
      queryKey: getListManagedChatTeamsQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: getListChatGroupsQueryKey() });
  };

  const resetForm = () => {
    setEditingTeam(null);
    setName("");
    setDescription("");
    setMemberUserIds([]);
    setTeamLeadUserId("");
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (team: ManagedChatTeam) => {
    setEditingTeam(team);
    setName(team.name);
    setDescription(team.description);
    setMemberUserIds(team.memberUserIds);
    setTeamLeadUserId(team.teamLeadUserId?.toString() ?? "");
    setDialogOpen(true);
  };

  const toggleMember = (userId: number, checked: boolean) => {
    setMemberUserIds((current) =>
      checked
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId),
    );
    if (!checked && Number(teamLeadUserId) === userId) {
      setTeamLeadUserId("");
    }
  };

  const handleSave = () => {
    const normalizedName = name.trim();
    const leadId = Number(teamLeadUserId);
    if (!normalizedName) {
      toast.error("Enter a team name.");
      return;
    }
    if (memberUserIds.length === 0) {
      toast.error("Add at least one employee to the team.");
      return;
    }
    if (!Number.isSafeInteger(leadId) || !memberUserIds.includes(leadId)) {
      toast.error("Choose a Team Lead from the selected employees.");
      return;
    }
    const data = {
      name: normalizedName,
      description: description.trim(),
      memberUserIds,
      teamLeadUserId: leadId,
    };
    const handlers = {
      onSuccess: () => {
        invalidateTeamData();
        toast.success(editingTeam ? "Team chat updated" : "Team chat created");
        setDialogOpen(false);
        resetForm();
      },
      onError: (error: unknown) =>
        toast.error("Could not save team chat", { description: apiError(error) }),
    };
    if (editingTeam) {
      updateTeam.mutate({ teamId: editingTeam.id, data }, handlers);
    } else {
      createTeam.mutate({ data }, handlers);
    }
  };

  const handleDelete = (team: ManagedChatTeam) => {
    if (
      !window.confirm(
        `Delete "${team.name}" and its chat messages? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteTeam.mutate(
      { teamId: team.id },
      {
        onSuccess: () => {
          invalidateTeamData();
          toast.success("Team chat deleted");
        },
        onError: (error: unknown) =>
          toast.error("Could not delete team chat", {
            description: apiError(error),
          }),
      },
    );
  };

  const selectedEmployees = employees.filter((employee) =>
    memberUserIds.includes(employee.id),
  );
  const isSaving = createTeam.isPending || updateTeam.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Users className="h-7 w-7 text-muted-foreground" />
            Manage Team Chats
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create employee teams, choose their members, and assign one lead to each team.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create team chat
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((item) => (
            <Card key={item} className="h-36 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : teams?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => {
            const teamMembers = employees.filter((employee) =>
              team.memberUserIds.includes(employee.id),
            );
            return (
              <Card key={team.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MessageSquarePlus className="h-5 w-5 shrink-0 text-primary" />
                      <span className="truncate">{team.name}</span>
                    </CardTitle>
                    {team.description && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {team.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${team.name}`}
                      onClick={() => openEditDialog(team)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${team.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      disabled={deleteTeam.isPending}
                      onClick={() => handleDelete(team)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      Lead: {team.teamLeadName || "Unassigned"}
                    </Badge>
                    <Badge variant="secondary">
                      {team.memberUserIds.length}{" "}
                      {team.memberUserIds.length === 1 ? "member" : "members"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {teamMembers.map((employee) => employee.fullName).join(", ") ||
                      "No active members"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessageSquarePlus className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="font-medium">No managed team chats yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one to choose employees and assign a Team Lead.
              </p>
            </div>
            <Button variant="outline" onClick={openCreateDialog}>
              Create team chat
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingTeam ? "Edit Team Chat" : "Create Team Chat"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="team-chat-name">Team name</Label>
              <Input
                id="team-chat-name"
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Social Media Team"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-chat-description">Description</Label>
              <Textarea
                id="team-chat-description"
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this team works on"
              />
            </div>
            <div className="space-y-2">
              <Label>Employees</Label>
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {employees.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={memberUserIds.includes(employee.id)}
                      onCheckedChange={(checked) =>
                        toggleMember(employee.id, checked === true)
                      }
                    />
                    <span className="min-w-0 truncate">{employee.fullName}</span>
                  </label>
                ))}
                {employees.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    There are no active employees to add.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Team Lead</Label>
              <Select
                value={teamLeadUserId}
                onValueChange={setTeamLeadUserId}
                disabled={selectedEmployees.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lead from the selected employees" />
                </SelectTrigger>
                <SelectContent>
                  {selectedEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The selected lead must also be a member of this chat.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || employees.length === 0}>
              {editingTeam ? "Save changes" : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
