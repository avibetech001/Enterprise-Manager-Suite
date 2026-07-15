import { Link } from "wouter";
import { useGetMyProfile, useGetMySummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CalendarClock,
  Palmtree,
  FolderKanban,
  Wallet,
  PackageOpen,
  Megaphone,
  ArrowRight,
} from "lucide-react";

export default function EmployeeDashboard() {
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: summary, isLoading: summaryLoading } = useGetMySummary();

  if (profileLoading || summaryLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
      </div>
    );
  }

  if (!profile || !summary) return null;

  const attendanceStatus = summary.attendanceToday
    ? summary.attendanceToday.checkOutAt
      ? "Checked out"
      : "Checked in"
    : "Not checked in";

  const attendanceBadgeClass = summary.attendanceToday
    ? summary.attendanceToday.checkOutAt
      ? "bg-muted text-muted-foreground border-border"
      : "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-muted text-muted-foreground border-border";

  const cards = [
    {
      href: "/employee/attendance",
      icon: CalendarClock,
      title: "Attendance Today",
      value: attendanceStatus,
      badgeClass: attendanceBadgeClass,
    },
    {
      href: "/employee/leave",
      icon: Palmtree,
      title: "Leave Balance",
      value: `${summary.leaveBalance.remaining} / ${summary.leaveBalance.allocation}`,
      sub: "days remaining",
    },
    {
      href: "/employee/projects",
      icon: FolderKanban,
      title: "Active Projects",
      value: String(summary.activeProjects),
    },
    {
      href: "/employee/fund-requests",
      icon: Wallet,
      title: "Pending Fund Requests",
      value: String(summary.pendingFundRequests),
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 border-2 border-border">
          <AvatarImage src={profile.profilePhotoUrl || undefined} />
          <AvatarFallback className="text-xl">
            {profile.firstName[0]}
            {profile.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {profile.firstName}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="outline">{profile.employeeCode}</Badge>
            {profile.employment.jobTitle && <span>{profile.employment.jobTitle}</span>}
            {profile.employment.employmentType && (
              <span className="capitalize">
                · {profile.employment.employmentType.replace("_", " ")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.title}
                </CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {c.badgeClass ? (
                    <Badge variant="outline" className={c.badgeClass}>
                      {c.value}
                    </Badge>
                  ) : (
                    <span className="text-2xl font-bold">{c.value}</span>
                  )}
                  {c.sub && <span className="text-xs text-muted-foreground">{c.sub}</span>}
                </div>
                <div className="mt-3 text-xs text-primary flex items-center gap-1">
                  View <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            Latest Announcements
          </CardTitle>
          <CardDescription>Company news and updates</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No announcements yet.</p>
          ) : (
            <div className="space-y-4">
              {summary.announcements.map((a) => (
                <div key={a.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{a.title}</h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
