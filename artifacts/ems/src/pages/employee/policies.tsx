import { getListPostsQueryKey, useGetCompany, useListPosts } from "@workspace/api-client-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleAlert, FileText, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompanyPostsWorkspace from "@/pages/company-posts-workspace";

export default function EmployeePolicies() {
  const params = { kind: "policy" as const };
  const policyQuery = useListPosts(params, { query: { queryKey: getListPostsQueryKey(params) } });
  const companyQuery = useGetCompany();
  const company = companyQuery.data;
  const companyValues = [
    { label: "Vision", value: company?.vision },
    { label: "Mission", value: company?.mission },
    { label: "Core values", value: company?.coreValues },
  ].filter((item) => item.value?.trim());

  if (policyQuery.isLoading) {
    return (
      <main className="min-h-[100dvh] bg-background px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
        <div className="mx-auto max-w-[1120px] space-y-5">
          <div className="rounded-2xl border border-border bg-card p-7"><Skeleton className="h-3 w-36" /><Skeleton className="mt-5 h-11 w-72" /><Skeleton className="mt-4 h-4 w-[min(520px,90%)]" /></div>
          <div className="rounded-2xl border border-border bg-card p-6"><Skeleton className="h-6 w-1/3" /><Skeleton className="mt-5 h-36 w-full" /></div>
        </div>
      </main>
    );
  }

  if (policyQuery.isError) {
    return (
      <main className="min-h-[100dvh] bg-background px-4 py-10 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-destructive/20 bg-card px-6 py-14 text-center">
          <CircleAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 font-serif text-3xl">Policies could not load.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your company guidance is safe. Try again in a moment.</p>
          <Button variant="outline" className="mt-5 rounded-xl" onClick={() => policyQuery.refetch()}>Retry</Button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-5 text-foreground sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1120px] space-y-6">
        <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-8 -top-14 h-64 w-64 rounded-full border border-primary/10 sm:right-8 sm:top-[-100px] sm:h-80 sm:w-80" />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.19em] text-primary"><span className="h-2 w-2 rounded-full bg-primary" />5th Element · Employee reference</div>
            <h1 className="flex items-center gap-3 font-serif text-4xl leading-none tracking-tight sm:text-5xl"><ScrollText className="h-8 w-8 text-primary" strokeWidth={1.4} />Company <span className="italic text-primary">Policies</span></h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">The current guidance for how we work together. Keep this close when questions come up.</p>
            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-border/80 pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><strong className="font-mono text-sm font-medium text-foreground">{String(policyQuery.data?.length || 0).padStart(2, "0")}</strong> published policies</span>
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Company-wide guidance</span>
            </div>
          </div>
        </header>

        {companyValues.length > 0 && (
          <section className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-5 sm:p-7">
            <div className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-primary">What guides us</p>
              <h2 className="mt-1 font-serif text-2xl tracking-tight">Vision, mission & values</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {companyValues.map((item, index) => (
                <div key={item.label} className="relative">
                  {index > 0 && <Separator className="mb-5 md:hidden" />}
                  <h3 className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">{item.label}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/80">{item.value}</p>
                </div>
              ))}
            </div>
          </section>
        )}
        {companyQuery.isError && <p className="text-sm text-muted-foreground">Company values are temporarily unavailable.</p>}
        <CompanyPostsWorkspace kind="policy" management={false} hideHeader />
      </div>
    </div>
  );
}
