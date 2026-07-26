import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPosts,
  useCreatePost,
  getListPostsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { BookOpen, Search, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  KB_CATEGORIES,
  categoryLabel,
  PostLink,
} from "@/pages/management/knowledge-base";

const PARAMS = { kind: "knowledge_base" as const };

export default function EmployeeKnowledgeBase() {
  const queryClient = useQueryClient();
  const queryKey = getListPostsQueryKey(PARAMS);
  const { data: posts, isLoading } = useListPosts(PARAMS, { query: { queryKey } });
  const createPost = useCreatePost();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formCategory, setFormCategory] = useState<string>("none");
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
            formCategory === "none"
              ? null
              : (formCategory as "idea_dump" | "samples" | "strategy"),
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
          setFormCategory("none");
          setLink("");
          setShowForm(false);
          queryClient.invalidateQueries({ queryKey });
        },
        onError: () => toast.error("Failed to publish article."),
      }
    );
  };

  const filtered = (posts || []).filter((p) => {
    if (category && p.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-muted-foreground" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground mt-1">Guides, resources and helpful articles.</p>
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
              <Label htmlFor="ekb-title">Title</Label>
              <Input
                id="ekb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Content idea for next week"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
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
              <Label htmlFor="ekb-body">Content</Label>
              <Textarea
                id="ekb-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Write the article content..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ekb-link">Link (optional)</Label>
              <Input
                id="ekb-link"
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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={category === null ? "default" : "outline"}
          size="sm"
          onClick={() => setCategory(null)}
        >
          All
        </Button>
        {KB_CATEGORIES.map((c) => (
          <Button
            key={c.value}
            variant={category === c.value ? "default" : "outline"}
            size="sm"
            onClick={() => setCategory(category === c.value ? null : c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">
            {search ? "No matching articles" : "No articles yet"}
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            {search
              ? "Try a different search term."
              : "There are no knowledge base articles available yet."}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {filtered.map((p) => (
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
