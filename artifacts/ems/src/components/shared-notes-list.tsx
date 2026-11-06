import { useListSharedNotes, getListSharedNotesQueryKey } from "@workspace/api-client-react";
import { FileText, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SharedNotesList() {
  const { data: notes, isLoading, isError } = useListSharedNotes({
    query: {
      queryKey: getListSharedNotesQueryKey(),
      refetchOnMount: "always",
      refetchInterval: 30_000,
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Shared with me
        </CardTitle>
        <CardDescription>
          Notes other people in your company have shared with you. These are read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading shared notes…</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            Shared notes could not be loaded.
          </p>
        ) : notes?.length ? (
          notes.map((note) => (
            <details key={`${note.id}-${note.sharedAt}`} className="group rounded-lg border p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">From {note.ownerName}</p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {note.content || "Empty note"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Shared {new Date(note.sharedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-primary group-open:hidden">
                    Open
                  </span>
                  <span className="hidden shrink-0 text-xs font-medium text-primary group-open:inline">
                    Close
                  </span>
                </div>
              </summary>
              <div className="ml-7 mt-4 border-t pt-4">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {note.content || "Empty note"}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Last updated {new Date(note.updatedAt).toLocaleString()}
                </p>
              </div>
            </details>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No employees have shared notes with you yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
