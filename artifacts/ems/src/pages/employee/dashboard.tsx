import { photoSrc } from "@/lib/photo";
import { Link } from "wouter";
import {
  useGetMyProfile,
  useGetMySummary,
  useListNotifications,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CalendarClock,
  FolderKanban,
  MessagesSquare,
  ChevronRight,
} from "lucide-react";

export default function EmployeeDashboard() {
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useGetMyProfile();
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetMySummary();
  const { data: notifications } = useListNotifications();

  if (!profile && !summary && (profileLoading || summaryLoading)) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
      </div>
    );
  }

  const attendanceStatus = summary?.attendanceToday
    ? summary.attendanceToday.checkOutAt
      ? "Checked out"
      : "Checked in"
    : "No check-in";

  const unreadChatCount =
    notifications?.filter(
      (notification) =>
        !notification.readAt &&
        (notification.link?.startsWith("chat") ||
          notification.link?.startsWith("/chat")),
    ).length || 0;

  const cards = summary ? [
    {
      href: "/employee/attendance",
      icon: CalendarClock,
      title: "Attendance",
      description: "Check in, check out, and view your attendance.",
      value: attendanceStatus,
      highlight: Boolean(summary.attendanceToday && !summary.attendanceToday.checkOutAt),
    },
    {
      href: "/employee/leave",
      icon: CalendarClock,
      title: "Leave Balance",
      description: `${summary.leaveBalance.allocation} days allocated this year.`,
      value: `${summary.leaveBalance.remaining} days left`,
    },
    {
      href: "/employee/projects",
      icon: FolderKanban,
      title: "My Projects",
      description: "View your assigned projects and deliverables.",
      value: String(summary.activeProjects),
    },
    {
      href: "/employee/chat",
      icon: MessagesSquare,
      title: "Team Chat",
      description: "Open group and private conversations.",
      value: unreadChatCount > 0 ? String(unreadChatCount) : undefined,
      pending: unreadChatCount > 0,
    },
  ] : [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-3 sm:p-5 md:space-y-8 md:p-8">
      {profile ? (
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 border-2 border-border sm:h-16 sm:w-16">
            <AvatarImage src={photoSrc(profile.profilePhotoUrl)} />
            <AvatarFallback className="text-lg sm:text-xl">
              {profile.firstName[0]}
              {profile.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome, {profile.firstName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
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
      ) : (
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Employee Dashboard
          </h1>
        </div>
      )}

      {(profileError || summaryError) && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-muted-foreground">
            Some dashboard details could not be loaded. Your available sections are still shown.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchProfile();
              void refetchSummary();
            }}
          >
            Try again
          </Button>
        </div>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Employee Hub</h2>
        {cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group relative flex min-h-24 flex-col justify-between rounded-xl border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:min-h-36 sm:p-5"
            >
              <div className="mb-3 flex items-start justify-between sm:mb-4">
                <div
                  className={`rounded-xl p-2 transition-colors sm:p-2.5 ${
                    card.pending
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      : card.highlight
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-primary/5 text-primary group-hover:bg-primary/10"
                  }`}
                >
                  <card.icon className="h-5 w-5" />
                </div>
                {card.value && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      card.pending
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {card.value}
                  </span>
                )}
              </div>
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold leading-tight transition-colors group-hover:text-primary sm:mb-1.5 sm:text-base">
                  {card.title}
                  <ChevronRight className="hidden h-4 w-4 -translate-x-2 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 sm:block" />
                </h3>
                <p className="hidden text-sm leading-snug text-muted-foreground sm:block">
                  {card.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
        ) : (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Dashboard details are temporarily unavailable. Use the navigation to open
            Attendance, Leave, Projects, or Team Chat, or retry the dashboard data above.
          </div>
        )}
      </section>
    </div>
  );
}
