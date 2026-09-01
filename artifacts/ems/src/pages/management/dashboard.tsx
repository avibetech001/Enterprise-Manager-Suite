import { format } from "date-fns";
import {
  useGetCurrentSession,
  useListEmployees,
  useListDepartments,
  useGetPendingCounts,
  useListNotifications,
  useListProjects,
  useListWorkReports,
  useListInvoices,
  getListEmployeesQueryKey,
  getListDepartmentsQueryKey,
  getGetPendingCountsQueryKey,
  getListNotificationsQueryKey,
  getListProjectsQueryKey,
  getListWorkReportsQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import {
  Building2,
  Users,
  FolderKanban,
  Palmtree,
  Wallet,
  MessagesSquare,
  NotebookPen,
  ReceiptText,
  Megaphone,
  CalendarClock,
  ClipboardCheck,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

export default function ManagementDashboard() {
  const { data: session } = useGetCurrentSession();

  const isSuperAdmin = session?.user.role === "super_admin";
  const hasPerm = (perm: string) =>
    isSuperAdmin || (session?.user.permissions || []).includes(perm as any);

  const canManageEmployees = hasPerm("manage_employees");
  const canManageDepartments = hasPerm("manage_departments");
  const canManageProjects = hasPerm("manage_projects");
  const canManageLeave = hasPerm("manage_leave");
  const canManageFinance = hasPerm("manage_finance");
  const canViewReports = hasPerm("view_reports");
  const canManageInvoices = hasPerm("manage_invoices") || canManageFinance;
  const canManageContent = hasPerm("manage_content");

  const { data: employees } = useListEmployees(
    {},
    {
      query: {
        enabled: canManageEmployees,
        queryKey: getListEmployeesQueryKey({}),
      },
    },
  );
  const { data: departments } = useListDepartments({
    query: {
      enabled: canManageDepartments,
      queryKey: getListDepartmentsQueryKey(),
    },
  });
  const { data: pendingCounts } = useGetPendingCounts({
    query: {
      refetchInterval: 30000,
      queryKey: getGetPendingCountsQueryKey(),
    },
  });
  const { data: notifications } = useListNotifications({
    query: {
      refetchInterval: 30000,
      queryKey: getListNotificationsQueryKey(),
    },
  });
  const { data: projects } = useListProjects({
    query: {
      enabled: canManageProjects,
      queryKey: getListProjectsQueryKey(),
    },
  });
  const { data: workReports } = useListWorkReports({
    query: {
      enabled: canViewReports,
      queryKey: getListWorkReportsQueryKey(),
    },
  });
  const { data: invoices } = useListInvoices({
    query: {
      enabled: canManageInvoices,
      queryKey: getListInvoicesQueryKey(),
    },
  });
  if (!session) return null;

  const activeEmployees = employees?.filter(e => e.accountStatus === 'active')?.length || 0;
  const activeProjectsCount = projects?.filter(p => p.status === 'active')?.length || 0;
  const pendingInvoices = invoices?.filter(i => i.status !== 'paid' && i.status !== 'cancelled')?.length;
  const unreadChatNotifications =
    notifications?.filter((n) => !n.readAt && n.link?.startsWith("/chat")).length ||
    0;

  const modules = [
    {
      title: "Leave Requests",
      description: "Review and manage employee time off.",
      icon: Palmtree,
      href: "/leave",
      count: pendingCounts?.leave,
      pending: true,
      show: canManageLeave
    },
    {
      title: "Fund Requests",
      description: "Approve and track financial requests.",
      icon: Wallet,
      href: "/fund-requests",
      count: pendingCounts?.fundRequests,
      pending: true,
      show: canManageFinance
    },
    {
      title: "Projects",
      description: "Track progress, members, and deliverables.",
      icon: FolderKanban,
      href: "/projects",
      count: activeProjectsCount,
      pending: false,
      active: true,
      show: canManageProjects
    },
    {
      title: "Team Chat",
      description: "Communicate with teams and departments.",
      icon: MessagesSquare,
      href: "/chat",
      count: unreadChatNotifications,
      pending: unreadChatNotifications > 0,
      show: true
    },
    {
      title: "Work Reports",
      description: "Review daily and weekly activity reports.",
      icon: NotebookPen,
      href: "/work-reports",
      count: workReports?.length,
      pending: false,
      show: canViewReports
    },
    {
      title: "Invoices",
      description: "Manage client billing and payments.",
      icon: ReceiptText,
      href: "/invoices",
      count: pendingInvoices,
      pending: true,
      show: canManageInvoices
    },
    {
      title: "Attendance",
      description: "Monitor daily check-ins and schedules.",
      icon: CalendarClock,
      href: "/attendance",
      show: hasPerm("manage_attendance_settings")
    },
    {
      title: "Appraisals",
      description: "Manage performance and evaluations.",
      icon: ClipboardCheck,
      href: "/appraisals",
      show: canManageEmployees
    },
    {
      title: "Announcements",
      description: "Publish company-wide updates.",
      icon: Megaphone,
      href: "/announcements",
      show: canManageContent
    },
    {
      title: "Knowledge Base",
      description: "Maintain company policies and documents.",
      icon: BookOpen,
      href: "/knowledge-base",
      show: canManageContent
    },
    {
      title: "Employees",
      description: "Manage employee records and accounts.",
      icon: Users,
      href: "/employees",
      count: activeEmployees,
      active: true,
      show: canManageEmployees
    },
    {
      title: "Departments",
      description: "Organize teams and structural units.",
      icon: Building2,
      href: "/departments",
      count: departments?.length,
      active: true,
      show: canManageDepartments
    }
  ].filter(m => m.show);

  const today = format(new Date(), 'EEEE, MMMM do, yyyy');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = session.user.fullName.split(' ')[0];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-3 sm:p-5 md:space-y-8 md:p-8 animate-in fade-in duration-300">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Good {greeting}, {firstName}
          </h1>
          <p className="text-muted-foreground mt-1.5 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            {today}
          </p>
        </div>
      </header>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Operations Hub</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {modules.map((module, i) => (
            <Link key={i} href={module.href} className="group relative flex min-h-36 flex-col justify-between rounded-xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5">
              <div className="flex items-start justify-between mb-4">
                <div className={"p-2.5 rounded-xl transition-colors " + (
                  module.pending && module.count ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/60"
                  : module.active && module.count ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60"
                  : "bg-primary/5 text-primary group-hover:bg-primary/10"
                )}>
                  <module.icon className="w-5 h-5" />
                </div>
                {module.count !== undefined && module.count > 0 && (
                  <span className={"inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold " + (
                    module.pending ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                    : "bg-secondary text-secondary-foreground"
                  )}>
                    {module.count} {module.pending ? 'Action Required' : ''}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-base mb-1.5 group-hover:text-primary transition-colors flex items-center gap-1.5">
                  {module.title}
                  <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                </h3>
                <p className="text-sm text-muted-foreground leading-snug">{module.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
