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
import { BookOpen, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const PARAMS = { kind: "knowledge_base" as const };

export default function ManagementKnowledgeBase() {
  const queryClient = useQueryClient();
  const queryKey = getListPostsQueryKey(PARAMS);
  const { data: posts, isLoading } = useListPosts(PARAMS, { query: { queryKey } });
  const createPost = useCreatePost();
  const deletePost = useDeletePost();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    createPost.mutate(
      { data: { kind: "knowledge_base", title: title.trim(), body: body.trim() } },
      {
        onSuccess: () => {
          toast.success("Article published.");
          setTitle("");
          setBody("");
          setShowForm(false);
          queryClient.invalidateQueries({ queryKey });
        },
        onError: () => toast.error("Failed to publish article."),
      }
    );
  };

  const remove = (id: number) => {
    deletePost.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Article deleted.");
          queryClient.invalidateQueries({ queryKey });
        },
        onError: () => toast.error("Failed to delete article."),
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-muted-foreground" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">
            Publish guides and resources for employees.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-2" />
          New Article
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Article</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kb-title">Title</Label>
              <Input
                id="kb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="How to request leave"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-body">Content</Label>
              <Textarea
                id="kb-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Write the article content..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={createPost.isPending}>
                Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : (posts || []).length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No articles yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Publish your first knowledge base article for employees.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {(posts || []).map((p) => (
                <AccordionItem key={p.id} value={String(p.id)}>
                  <AccordionTrigger className="text-left">{p.title}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.body}</p>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs text-muted-foreground">
                        Updated {format(new Date(p.updatedAt), "PPP")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => remove(p.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
