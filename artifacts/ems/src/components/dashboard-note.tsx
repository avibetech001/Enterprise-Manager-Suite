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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, NotebookPen, Plus, Save } from "lucide-react";

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isLoading || isNewNote || activeNoteId !== null || !notes?.length) return;
    const firstNote = notes[0];
    if (!firstNote) return;
    setActiveNoteId(firstNote.id);
    setTitle(firstNote.title);
    setContent(firstNote.content);
  }, [activeNoteId, isLoading, isNewNote, notes]);

  const activeNote = notes?.find((note) => note.id === activeNoteId);
  const isSaving = createNote.isPending || updateNote.isPending;
  const saveError = createNote.isError || updateNote.isError;

  const beginNewNote = () => {
    setIsNewNote(true);
    setActiveNoteId(null);
    setTitle("");
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
    setTitle(note.title);
    setContent(note.content);
    setSaved(false);
    createNote.reset();
    updateNote.reset();
  };

  const saveAsDraft = () => {
    const noteTitle =
      title.trim() ||
      content
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 120) ||
      "Untitled note";
    const data = { title: noteTitle, content };
    setSaved(false);

    const onSuccess = async (note: {
      id: number;
      title: string;
      content: string;
    }) => {
      setActiveNoteId(note.id);
      setIsNewNote(false);
      setTitle(note.title);
      setContent(note.content);
      setSaved(true);
      await queryClient.invalidateQueries({
        queryKey: getListMyNotesQueryKey(),
      });
    };

    if (activeNoteId !== null) {
      updateNote.mutate(
        { noteId: activeNoteId, data },
        { onSuccess },
      );
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
          <aside className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Saved notes</h3>
              <Button type="button" size="sm" variant="outline" onClick={beginNewNote}>
                <Plus className="mr-1.5 h-4 w-4" />
                New note
              </Button>
            </div>

            {isError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                Saved notes could not be loaded.
              </p>
            ) : notes?.length ? (
              <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openNote(note.id)}
                    aria-current={activeNoteId === note.id ? "true" : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted ${
                      activeNoteId === note.id && !isNewNote ? "bg-muted" : ""
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">
                      {note.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Saved {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {isLoading ? "Loading notes..." : "No saved notes yet. Start a new note to create one."}
                </p>
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-3">
            <Input
              aria-label="Note title"
              placeholder="Note title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaved(false);
              }}
              maxLength={120}
            />
            <Textarea
              aria-label="Personal dashboard notes"
              placeholder="Write a note or reminder..."
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setSaved(false);
              }}
              maxLength={50000}
              className="min-h-40 resize-y"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span aria-live="polite" className="text-sm text-muted-foreground">
                {isSaving
                  ? "Saving draft..."
                  : saveError
                    ? "Could not save. Please try again."
                    : saved
                      ? "Draft saved."
                      : activeNote
                        ? `Last saved ${new Date(activeNote.updatedAt).toLocaleString()}`
                        : isNewNote
                          ? "New draft"
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
