import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPosts,
  useCreatePost,
  useDeletePost,
  getListPostsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Megaphone, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PARAMS = { kind: "announcement" as const };

export default function ManagementAnnouncements() {
  const queryClient = useQueryClient();
  const queryKey = getListPostsQueryKey(PARAMS);
  const { data: posts, isLoading } = useListPosts(PARAMS, { query: { queryKey } });
  useNotificationFocus(!!posts);
  const createPost = useCreatePost();
  const deletePost = useDeletePost();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    createPost.mutate(
      { data: { kind: "announcement", title: title.trim(), body: body.trim() } },
      {
        onSuccess: () => {
          toast.success("Announcement posted. All employees have been notified.");
          setTitle("");
          setBody("");
          setShowForm(false);
          queryClient.invalidateQueries({ queryKey });
        },
        onError: () => toast.error("Failed to post announcement."),
      }
    );
  };

  const remove = (id: number) => {
    deletePost.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Announcement deleted.");
          queryClient.invalidateQueries({ queryKey });
        },
        onError: () => toast.error("Failed to delete announcement."),
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-muted-foreground" />
            Announcements
          </h1>
          <p className="text-muted-foreground mt-1">
            Post company-wide announcements. Everyone will see them.
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4 mr-2" />
          New Announcement
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>New Announcement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Office closed on Friday"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Write your announcement..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={createPost.isPending}>
                {createPost.isPending ? "Posting..." : "Post Announcement"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No announcements yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Post your first announcement to notify everyone.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <Card key={p.id} id={`focus-${p.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{p.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(p.createdAt), "PPP p")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                      {p.body}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => remove(p.id)}
                    disabled={deletePost.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
