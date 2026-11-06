import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyNoteSharesQueryKey,
  getListNoteShareOptionsQueryKey,
  useCreateExternalNoteShare,
  useGetMyNoteShares,
  useListNoteShareOptions,
  useRevokeExternalNoteShare,
  useUpdateMyNoteShares,
} from "@workspace/api-client-react";
import { Copy, Link2, LoaderCircle, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NoteSharingDialogProps {
  noteId: number;
  noteContent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NoteSharingDialog({
  noteId,
  noteContent,
  open,
  onOpenChange,
}: NoteSharingDialogProps) {
  const queryClient = useQueryClient();
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [guestLink, setGuestLink] = useState("");
  const { data: employees, isLoading: employeesLoading } = useListNoteShareOptions({
    query: {
      queryKey: getListNoteShareOptionsQueryKey(),
      enabled: open,
      staleTime: 60_000,
    },
  });
  const {
    data: sharing,
    isLoading: sharingLoading,
    isError: sharingError,
  } = useGetMyNoteShares(noteId, {
    query: {
      queryKey: getGetMyNoteSharesQueryKey(noteId),
      enabled: open,
      refetchOnMount: "always",
    },
  });
  const updateShares = useUpdateMyNoteShares();
  const createExternalShare = useCreateExternalNoteShare();
  const revokeExternalShare = useRevokeExternalNoteShare();

  useEffect(() => {
    if (!open || !sharing) return;
    setSelectedUserIds(sharing.recipients.map((recipient) => recipient.userId));
  }, [open, sharing]);

  const toggleRecipient = (userId: number, checked: boolean) => {
    setSelectedUserIds((current) =>
      checked
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId),
    );
  };

  const saveRecipients = () => {
    updateShares.mutate(
      { noteId, data: { recipientUserIds: selectedUserIds } },
      {
        onSuccess: async (result) => {
          setSelectedUserIds(result.recipients.map((recipient) => recipient.userId));
          await queryClient.invalidateQueries({
            queryKey: getGetMyNoteSharesQueryKey(noteId),
          });
          toast.success("Note sharing updated.");
        },
        onError: () => toast.error("Could not update note sharing."),
      },
    );
  };

  const createGuestLink = () => {
    createExternalShare.mutate(
      { noteId },
      {
        onSuccess: async ({ token }) => {
          const basePath = import.meta.env.BASE_URL.replace(/\/+$/, "");
          setGuestLink(
            `${window.location.origin}${basePath}/shared-note?token=${encodeURIComponent(token)}`,
          );
          await queryClient.invalidateQueries({
            queryKey: getGetMyNoteSharesQueryKey(noteId),
          });
          toast.success("Guest link created.");
        },
        onError: () => toast.error("Could not create a guest link."),
      },
    );
  };

  const revokeGuestLink = () => {
    revokeExternalShare.mutate(
      { noteId },
      {
        onSuccess: async () => {
          setGuestLink("");
          await queryClient.invalidateQueries({
            queryKey: getGetMyNoteSharesQueryKey(noteId),
          });
          toast.success("Guest link revoked.");
        },
        onError: () => toast.error("Could not revoke the guest link."),
      },
    );
  };

  const copyGuestLink = async () => {
    try {
      await navigator.clipboard.writeText(guestLink);
      toast.success("Guest link copied.");
    } catch {
      toast.error("Could not copy the link. Select and copy it instead.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Share saved note
          </DialogTitle>
          <DialogDescription className="line-clamp-2 whitespace-pre-wrap break-words">
            {noteContent.trim().split("\n")[0] || "This note"}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Share with employees</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Only selected active employees in your company can read this note.
          </p>
          {employeesLoading || sharingLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading employees…
            </div>
          ) : sharingError ? (
            <p role="alert" className="text-sm text-destructive">
              Sharing settings could not be loaded.
            </p>
          ) : employees?.length ? (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {employees.map((employee) => (
                <label
                  key={employee.userId}
                  className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedUserIds.includes(employee.userId)}
                    onCheckedChange={(checked) =>
                      toggleRecipient(employee.userId, checked === true)
                    }
                    aria-label={`Share with ${employee.fullName}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{employee.fullName}</span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {employee.email}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              No other active employees are available to share with.
            </p>
          )}
          <Button
            type="button"
            onClick={saveRecipients}
            disabled={
              updateShares.isPending ||
              sharingLoading ||
              employeesLoading ||
              sharingError
            }
          >
            {updateShares.isPending ? "Saving…" : "Save employee access"}
          </Button>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Share with someone outside the company</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Guests request a one-time code. You’ll receive the code in your notifications
            and can pass it to them. Codes expire after 24 hours.
          </p>
          {sharing?.externalShareActive && (
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              A guest link is active. Creating another link will replace it.
            </p>
          )}
          {guestLink && (
            <div className="flex gap-2">
              <Input aria-label="Guest share link" readOnly value={guestLink} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy guest link"
                onClick={copyGuestLink}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={createGuestLink}
              disabled={createExternalShare.isPending}
            >
              {createExternalShare.isPending
                ? "Creating link…"
                : sharing?.externalShareActive
                  ? "Replace guest link"
                  : "Create guest link"}
            </Button>
            {sharing?.externalShareActive && (
              <Button
                type="button"
                variant="destructive"
                onClick={revokeGuestLink}
                disabled={revokeExternalShare.isPending}
              >
                {revokeExternalShare.isPending ? "Revoking…" : "Revoke link"}
              </Button>
            )}
          </div>
        </section>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
