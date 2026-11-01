import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyNoteDraftQueryKey,
  useGetMyNoteDraft,
  useSaveMyNoteDraft,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { NotebookPen, Save } from "lucide-react";

export function DashboardNote() {
  const queryClient = useQueryClient();
  const { data: draft, isLoading, isError } = useGetMyNoteDraft();
  const saveDraft = useSaveMyNoteDraft();
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (draft) setContent(draft.content);
  }, [draft]);

  const handleSave = () => {
    setSaved(false);
    saveDraft.mutate(
      { data: { content } },
      {
        onSuccess: async (result) => {
          setContent(result.content);
          setSaved(true);
          await queryClient.invalidateQueries({
            queryKey: getGetMyNoteDraftQueryKey(),
          });
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <NotebookPen className="h-5 w-5 text-primary" />
          My Notes
        </CardTitle>
        <CardDescription>
          Personal notes are private to your account. Save them as a draft to continue later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Your saved note could not be loaded. You can still write and try saving again.
          </p>
        )}
        <Textarea
          aria-label="Personal dashboard notes"
          placeholder="Write a note or reminder..."
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setSaved(false);
          }}
          disabled={isLoading}
          maxLength={50000}
          className="min-h-32 resize-y"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {saveDraft.isPending
              ? "Saving draft..."
              : saveDraft.isError
                ? "Could not save. Please try again."
                : saved
                  ? "Draft saved."
                  : draft?.updatedAt
                    ? `Last saved ${new Date(draft.updatedAt).toLocaleString()}`
                    : "Not saved yet"}
          </span>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saveDraft.isPending || isLoading}
          >
            <Save className="mr-2 h-4 w-4" />
            Save draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
