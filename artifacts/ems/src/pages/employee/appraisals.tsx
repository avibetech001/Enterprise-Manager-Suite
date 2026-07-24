import { useNotificationFocus } from "@/lib/use-notification-focus";
import { useListMyAppraisals } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck } from "lucide-react";
import { AppraisalCard } from "@/pages/management/appraisals";

export default function MyAppraisalsPage() {
  const { data: appraisals, isLoading } = useListMyAppraisals();
  useNotificationFocus(!!appraisals);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-muted-foreground" />
          My Appraisals
        </h1>
        <p className="text-muted-foreground mt-1">
          Performance reviews from management.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (appraisals || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No appraisals yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(appraisals || []).map((a) => (
            <div key={a.id} id={`focus-${a.id}`}>
              <AppraisalCard appraisal={a} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
