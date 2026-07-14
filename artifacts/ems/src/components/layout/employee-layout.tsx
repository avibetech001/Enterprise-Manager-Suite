import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useGetCurrentSession, useLogout } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  User,
  CalendarClock,
  Palmtree,
  FolderKanban,
  Wallet,
  PackageOpen,
  ScrollText,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./notifications-bell";

const NAV = [
  {
    label: "Overview",
    items: [
      { href: "/employee", icon: LayoutDashboard, title: "Dashboard" },
      { href: "/employee/profile", icon: User, title: "My Profile" },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/employee/attendance", icon: CalendarClock, title: "Attendance" },
      { href: "/employee/leave", icon: Palmtree, title: "Leave" },
      { href: "/employee/projects", icon: FolderKanban, title: "My Projects" },
      { href: "/employee/fund-requests", icon: Wallet, title: "Fund Requests" },
      { href: "/employee/requisitions", icon: PackageOpen, title: "Requisitions" },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/employee/policies", icon: ScrollText, title: "Company Policies" },
      { href: "/employee/knowledge-base", icon: BookOpen, title: "Knowledge Base" },
      { href: "/employee/settings", icon: Settings, title: "Settings" },
    ],
  },
];

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
      },
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
              <span className="font-semibold text-sm leading-tight tracking-tight">
                5th Element
              </span>
              <span className="text-xs text-muted-foreground leading-tight">
                Employee Portal
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {NAV.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton isActive={location === item.href} asChild>
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-border p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{user.fullName}</span>
                <span className="text-xs text-muted-foreground">Employee</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
                disabled={logout.isPending}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          <header className="h-14 border-b border-border flex items-center justify-between px-4 gap-4 sticky top-0 bg-background z-10">
            <SidebarTrigger className="md:hidden" />
            <div className="flex-1" />
            <NotificationsBell />
          </header>
          <div className="flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
