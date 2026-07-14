import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetCurrentSession, useLogout } from "@workspace/api-client-react";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function EmployeeLayout({ children }: { children: ReactNode }) {
  const { data: session } = useGetCurrentSession();
  const [location, setLocation] = useLocation();
  const logout = useLogout();

  if (!session) return null;

  const user = session.user;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/employee-login");
      }
    });
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold">
              5E
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight tracking-tight">5th Element</span>
              <span className="text-xs text-muted-foreground leading-tight">Employee Portal</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium hidden sm:block">
              {user.fullName}
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
