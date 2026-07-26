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
import { BookOpen, Trash2, Plus, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const PARAMS = { kind: "knowledge_base" as const };

export const KB_CATEGORIES = [
  { value: "idea_dump", label: "Idea Dump" },
  { value: "samples", label: "Samples" },
  { value: "strategy", label: "Strategy" },
] as const;

export function categoryLabel(value: string | null | undefined): string | null {
  return KB_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

export function normalizeUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function PostLink({ link }: { link: string | null | undefined }) {
  if (!link) return null;
  return (
    <a
      href={normalizeUrl(link)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 mt-3 text-sm text-primary underline underline-offset-2 break-all"
    >
      <LinkIcon className="h-3.5 w-3.5 shrink-0" />
      {link}
    </a>
  );
}

export default function ManagementKnowledgeBase() {
  const queryClient = useQueryClient();
  const queryKey = getListPostsQueryKey(PARAMS);
  const { data: posts, isLoading } = useListPosts(PARAMS, { query: { queryKey } });
  const createPost = useCreatePost();
  const deletePost = useDeletePost();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("none");
  const [link, setLink] = useState("");

  const submit = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    createPost.mutate(
      {
        data: {
          kind: "knowledge_base",
          category:
            category === "none"
              ? null
              : (category as "idea_dump" | "samples" | "strategy"),
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Article published.");
          setTitle("");
          setBody("");
          setCategory("none");
          setLink("");
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
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {KB_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="space-y-2">
              <Label htmlFor="kb-link">Link (optional)</Label>
              <Input
                id="kb-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="e.g. an Instagram post — https://www.instagram.com/p/..."
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
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2 flex-wrap">
                      {p.title}
                      {categoryLabel(p.category) && (
                        <Badge variant="outline" className="font-normal">
                          {categoryLabel(p.category)}
                        </Badge>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.body}</p>
                    <PostLink link={p.link} />
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
