import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetSetupStatus, useGetCurrentSession, getGetSetupStatusQueryKey, getGetCurrentSessionQueryKey } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";

function FullPageLoading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading system...</p>
      </div>
    </div>
  );
}

export function SetupGuard({ children }: { children: ReactNode }) {
  const { data: setupStatus, isLoading } = useGetSetupStatus({ query: { retry: false, queryKey: getGetSetupStatusQueryKey() } });
  const [location, setLocation] = useLocation();

  const needsRedirectToSetup = !!setupStatus && !setupStatus.isSetupComplete && location !== "/setup";
  const needsRedirectAwayFromSetup = !!setupStatus && setupStatus.isSetupComplete && location === "/setup";

  useEffect(() => {
    if (needsRedirectToSetup) {
      setLocation("/setup");
    } else if (needsRedirectAwayFromSetup) {
      setLocation("/");
    }
  }, [needsRedirectToSetup, needsRedirectAwayFromSetup, setLocation]);

  if (isLoading) return <FullPageLoading />;
  if (needsRedirectToSetup || needsRedirectAwayFromSetup) return <FullPageLoading />;

  return <>{children}</>;
}

export function ManagementGuard({ children }: { children: ReactNode }) {
  const { data: session, isLoading, isError } = useGetCurrentSession({ query: { retry: false, queryKey: getGetCurrentSessionQueryKey() } });
  const [, setLocation] = useLocation();

  const shouldRedirect =
    !isLoading &&
    (isError || !session || (session.user.role !== "super_admin" && session.user.role !== "hr"));

  useEffect(() => {
    if (shouldRedirect) {
      setLocation("/management-login");
    }
  }, [shouldRedirect, setLocation]);

  if (isLoading || shouldRedirect) return <FullPageLoading />;

  return <>{children}</>;
}

export function EmployeeGuard({ children }: { children: ReactNode }) {
  const { data: session, isLoading, isError } = useGetCurrentSession({ query: { retry: false, queryKey: getGetCurrentSessionQueryKey() } });
  const [, setLocation] = useLocation();

  const shouldRedirect = !isLoading && (isError || !session || session.user.role !== "employee");

  useEffect(() => {
    if (shouldRedirect) {
      setLocation("/employee-login");
    }
  }, [shouldRedirect, setLocation]);

  if (isLoading || shouldRedirect) return <FullPageLoading />;

  return <>{children}</>;
}

export function GuestGuard({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useGetCurrentSession({ query: { retry: false, queryKey: getGetCurrentSessionQueryKey() } });
  const [, setLocation] = useLocation();

  const redirectTarget = session
    ? session.user.role === "employee"
      ? "/employee"
      : "/dashboard"
    : null;

  useEffect(() => {
    if (redirectTarget) {
      setLocation(redirectTarget);
    }
  }, [redirectTarget, setLocation]);

  if (isLoading || redirectTarget) return <FullPageLoading />;

  return <>{children}</>;
}
