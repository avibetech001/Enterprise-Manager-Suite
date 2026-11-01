import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMyNotesQueryKey,
  useCreateMyNote,
  useDeleteMyNote,
  useListMyNotes,
  useUpdateMyNote,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FileText, NotebookPen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

function notePreview(content: string): string {
  return content.trim() || "Empty note";
}

export function DashboardNote() {
  const queryClient = useQueryClient();
  const {
    data: notes,
    isLoading,
    isError,
  } = useListMyNotes({
    query: {
      queryKey: getListMyNotesQueryKey(),
      refetchOnMount: "always",
    },
  });
  const createNote = useCreateMyNote();
  const updateNote = useUpdateMyNote();
  const deleteNote = useDeleteMyNote();
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<number | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isLoading || isNewNote || activeNoteId !== null || !notes?.length) return;
    const firstNote = notes[0];
    if (!firstNote) return;
    setActiveNoteId(firstNote.id);
    setContent(firstNote.content);
  }, [activeNoteId, isLoading, isNewNote, notes]);

  const activeNote = notes?.find((note) => note.id === activeNoteId);
  const notePendingDelete = notes?.find((note) => note.id === deleteNoteId);
  const isSaving = createNote.isPending || updateNote.isPending;
  const saveError = createNote.isError || updateNote.isError;

  const beginNewNote = () => {
    setIsNewNote(true);
    setActiveNoteId(null);
    setContent("");
    setSaved(false);
    createNote.reset();
    updateNote.reset();
  };

  const openNote = (noteId: number) => {
    const note = notes?.find((item) => item.id === noteId);
    if (!note) return;
    setIsNewNote(false);
    setActiveNoteId(note.id);
    setContent(note.content);
    setSaved(false);
    createNote.reset();
    updateNote.reset();
  };

  const saveAsDraft = () => {
    const data = { content };
    setSaved(false);

    const onSuccess = async () => {
      setActiveNoteId(null);
      setIsNewNote(true);
      setContent("");
      setSaved(true);
      await queryClient.invalidateQueries({
        queryKey: getListMyNotesQueryKey(),
      });
    };

    if (activeNoteId !== null) {
      updateNote.mutate({ noteId: activeNoteId, data }, { onSuccess });
    } else {
      createNote.mutate({ data }, { onSuccess });
    }
  };

  const confirmDelete = () => {
    if (deleteNoteId === null) return;
    const noteId = deleteNoteId;
    deleteNote.mutate(
      { noteId },
      {
        onSuccess: async () => {
          if (activeNoteId === noteId) {
            setActiveNoteId(null);
            setIsNewNote(true);
            setContent("");
            setSaved(false);
          }
          setDeleteNoteId(null);
          await queryClient.invalidateQueries({
            queryKey: getListMyNotesQueryKey(),
          });
          toast.success("Note deleted.");
        },
        onError: () => toast.error("Could not delete this note."),
      },
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <NotebookPen className="h-5 w-5 text-primary" />
            My Notes
          </CardTitle>
          <CardDescription>
            Your notes are private to your account. Save drafts and reopen them whenever you need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.6fr)]">
            <aside className="flex h-36 min-h-0 flex-col rounded-lg border p-3 md:h-64">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Saved notes</h3>
                <Button type="button" size="sm" variant="outline" onClick={beginNewNote}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New note
                </Button>
              </div>
              <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Saved notes could not be loaded.
                  </p>
                ) : notes?.length ? (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className={`flex items-start gap-1 rounded-md ${
                        activeNoteId === note.id && !isNewNote ? "bg-muted" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1 py-2 pl-3">
                        <span className="line-clamp-3 block whitespace-pre-wrap break-words text-sm leading-snug">
                          {notePreview(note.content)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Saved {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 pr-1 pt-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Edit saved note"
                          title="Edit note"
                          onClick={() => openNote(note.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Delete saved note"
                          title="Delete note"
                          onClick={() => {
                            deleteNote.reset();
                            setDeleteNoteId(note.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 shrink-0" />
                    <p>{isLoading ? "Loading notes..." : "No saved notes yet."}</p>
                  </div>
                )}
              </div>
            </aside>

            <div className="min-w-0 space-y-3">
              <Textarea
                aria-label="Personal dashboard notes"
                placeholder="Write a new note or select a saved note..."
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setSaved(false);
                }}
                maxLength={50000}
                className="min-h-32 resize-y md:min-h-40"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span aria-live="polite" className="text-sm text-muted-foreground">
                  {isSaving
                    ? "Saving draft..."
                    : saveError
                      ? "Could not save. Please try again."
                      : saved
                        ? "Draft saved. Ready for a new note."
                        : activeNote
                          ? `Last saved ${new Date(activeNote.updatedAt).toLocaleString()}`
                          : isNewNote
                            ? "New note"
                            : "Start a new note or select a saved one"}
                </span>
                <Button
                  type="button"
                  onClick={saveAsDraft}
                  disabled={isSaving || isLoading}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save draft
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteNoteId !== null}
        onOpenChange={(open) => {
          if (!open && !deleteNote.isPending) setDeleteNoteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected note. This action cannot be undone.
              {notePendingDelete && (
                <span className="mt-2 block line-clamp-3 whitespace-pre-wrap break-words">
                  {notePreview(notePendingDelete.content)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteNote.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteNote.isPending || deleteNoteId === null}
            >
              {deleteNote.isPending ? "Deleting..." : "Delete note"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
