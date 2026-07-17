import { useState } from "react";
import { useListPosts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KB_CATEGORIES, categoryLabel } from "@/pages/management/knowledge-base";

export default function EmployeeKnowledgeBase() {
  const { data: posts, isLoading } = useListPosts(
    { kind: "knowledge_base" },
    { query: { queryKey: ["/api/posts", { kind: "knowledge_base" }] } }
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const filtered = (posts || []).filter((p) => {
    if (category && p.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-muted-foreground" />
          Knowledge Base
        </h1>
        <p className="text-muted-foreground mt-1">Guides, resources and helpful articles.</p>
      </div>

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
