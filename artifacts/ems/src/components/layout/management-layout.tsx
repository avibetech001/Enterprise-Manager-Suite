import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { useGetCurrentSession, useLogout } from "@workspace/api-client-react";
import { LayoutDashboard, Users, UserSquare2, Building2, Settings, Building, LogOut, FileText, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./notifications-bell";

export function ManagementLayout({ children }: { children: ReactNode }) {
  const { data: session } = useGetCurrentSession();
  const [location, setLocation] = useLocation();
  const logout = useLogout();

  if (!session) return null; // Handled by ManagementGuard

  const user = session.user;
  const permissions = user.permissions || [];
  const isSuperAdmin = user.role === "super_admin";

  const hasPerm = (perm: string) => isSuperAdmin || permissions.includes(perm as any);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/management-login");
      }
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar variant="inset" className="bg-card border-r border-border">
          <SidebarHeader className="border-b border-border p-4 flex flex-row items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold">
              5E
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight tracking-tight">5th Element EMS</span>
              <span className="text-xs text-muted-foreground leading-tight">{session.company.name}</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Operations</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={location === "/dashboard"} asChild>
                      <Link href="/dashboard">
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {(hasPerm("manage_employees") || isSuperAdmin) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={location === "/employees"} asChild>
                        <Link href="/employees">
                          <Users className="h-4 w-4" />
                          <span>Employees</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {(hasPerm("manage_departments") || isSuperAdmin) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={location === "/departments"} asChild>
                        <Link href="/departments">
                          <Building2 className="h-4 w-4" />
                          <span>Departments</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  
                  {(hasPerm("manage_attendance_settings") || isSuperAdmin) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={location === "/settings/attendance"} asChild>
                        <Link href="/settings/attendance">
                          <CalendarClock className="h-4 w-4" />
                          <span>Attendance (Soon)</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  
                  {(hasPerm("view_reports") || isSuperAdmin) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={location === "/reports"} asChild>
                        <Link href="/reports">
                          <FileText className="h-4 w-4" />
                          <span>Reports (Soon)</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {(hasPerm("manage_users") || isSuperAdmin) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={location === "/users"} asChild>
                        <Link href="/users">
                          <UserSquare2 className="h-4 w-4" />
                          <span>Management Users</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {(hasPerm("manage_company_settings") || isSuperAdmin) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={location === "/settings/company"} asChild>
                        <Link href="/settings/company">
                          <Settings className="h-4 w-4" />
                          <span>Company Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-border p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{user.fullName}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user.role.replace("_", " ")}
                </span>
              </div>
              <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleLogout} disabled={logout.isPending}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          <header className="h-14 border-b border-border flex items-center justify-end px-4 gap-4 sticky top-0 bg-background z-10">
            <NotificationsBell />
          </header>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
