import { useListPosts, useGetCompany } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { ScrollText } from "lucide-react";

export default function EmployeePolicies() {
  const { data: posts, isLoading } = useListPosts(
    { kind: "policy" },
    { query: { queryKey: ["/api/posts", { kind: "policy" }] } }
  );
  const { data: company } = useGetCompany();

  const cvItems = [
    { label: "Vision", value: company?.vision },
    { label: "Mission", value: company?.mission },
    { label: "Core Values", value: company?.coreValues },
  ].filter((i) => i.value && i.value.trim().length > 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ScrollText className="h-7 w-7 text-muted-foreground" />
          Company Policies
        </h1>
        <p className="text-muted-foreground mt-1">Company guidelines, vision and values.</p>
      </div>

      {cvItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Vision, Mission & Core Values</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cvItems.map((i, idx) => (
              <div key={i.label}>
                {idx > 0 && <Separator className="mb-4" />}
                <h3 className="text-sm font-medium mb-1">{i.label}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{i.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <ScrollText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No policies published</h3>
          <p className="text-muted-foreground text-sm mt-1">
            There are no company policies available yet.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {posts.map((p) => (
                <AccordionItem key={p.id} value={String(p.id)}>
                  <AccordionTrigger className="text-left">{p.title}</AccordionTrigger>
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
