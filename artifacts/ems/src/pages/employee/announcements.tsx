import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useListPosts, getListPostsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { format } from "date-fns";

const PARAMS = { kind: "announcement" as const };

export default function EmployeeAnnouncements() {
  const { data: posts, isLoading } = useListPosts(PARAMS, {
    query: { queryKey: getListPostsQueryKey(PARAMS) },
  });
  useNotificationFocus(!!posts);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="h-7 w-7 text-muted-foreground" />
          Announcements
        </h1>
        <p className="text-muted-foreground mt-1">Company-wide news and updates.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No announcements</h3>
          <p className="text-muted-foreground text-sm mt-1">
            There are no announcements yet. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <Card key={p.id} id={`focus-${p.id}`}>
              <CardContent className="pt-6">
                <h3 className="font-semibold">{p.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(p.createdAt), "PPP p")}
                </p>
                <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
