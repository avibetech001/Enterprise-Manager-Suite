import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPosts,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
  getListPostsQueryKey,
  CompanyPost,
  CompanyPostInputKind,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const postSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
});
type PostFormValues = z.infer<typeof postSchema>;

type Kind = CompanyPostInputKind;

const TABS: { kind: Kind; label: string }[] = [
  { kind: "announcement", label: "Announcements" },
  { kind: "policy", label: "Policies" },
  { kind: "knowledge_base", label: "Knowledge Base" },
];

function PostSection({ kind }: { kind: Kind }) {
  const queryClient = useQueryClient();
  const { data: posts, isLoading } = useListPosts({ kind });
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyPost | null>(null);

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: { title: "", body: "" },
  });

  const openDialog = (post?: CompanyPost) => {
    if (post) {
      setEditing(post);
      form.reset({ title: post.title, body: post.body });
    } else {
      setEditing(null);
      form.reset({ title: "", body: "" });
    }
    setIsDialogOpen(true);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({ kind }) });

  const onSubmit = (data: PostFormValues) => {
    if (editing) {
      updatePost.mutate(
        { id: editing.id, data: { kind, title: data.title, body: data.body } },
        {
          onSuccess: () => {
            invalidate();
            toast.success("Post updated");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to update post", { description: error.data?.error || "Unknown error occurred" });
          },
        }
      );
    } else {
      createPost.mutate(
        { data: { kind, title: data.title, body: data.body } },
        {
          onSuccess: () => {
            invalidate();
            toast.success("Post created");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to create post", { description: (error as { data?: { error?: string } })?.data?.error || "Unknown error occurred" });
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    deletePost.mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Post deleted");
        },
        onError: (error) => {
          toast.error("Failed to delete post", { description: (error as { data?: { error?: string } })?.data?.error || "Unknown error occurred" });
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {kind === "announcement" && (
        <p className="text-sm text-muted-foreground">Announcements notify all active employees.</p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Create
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{post.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{post.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Updated {post.updatedAt.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openDialog(post)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(post.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg bg-card">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No content yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Get started by creating your first entry.</p>
          <Button variant="outline" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Create
          </Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Create"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Body</FormLabel>
                    <FormControl>
                      <Textarea rows={8} placeholder="Write the content..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPost.isPending || updatePost.isPending}>
                  {editing ? "Save Changes" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ContentPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content</h1>
        <p className="text-muted-foreground mt-1">Manage announcements, policies, and knowledge base articles.</p>
      </div>

      <Tabs defaultValue="announcement">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.kind} value={t.kind}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.kind} value={t.kind} className="mt-4">
            <PostSection kind={t.kind} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
