import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMyNotesQueryKey,
  useCreateMyNote,
  useListMyNotes,
  useUpdateMyNote,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FileText, NotebookPen, Plus, Save } from "lucide-react";

function notePreview(content: string): string {
  const preview = content.replace(/\s+/g, " ").trim();
  return preview ? preview.slice(0, 80) : "Empty note";
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
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
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

  return (
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
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openNote(note.id)}
                    aria-current={
                      activeNoteId === note.id && !isNewNote ? "true" : undefined
                    }
                    className={`w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted ${
                      activeNoteId === note.id && !isNewNote ? "bg-muted" : ""
                    }`}
                  >
                    <span className="block text-sm leading-snug">
                      {notePreview(note.content)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Saved {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
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
  );
}
