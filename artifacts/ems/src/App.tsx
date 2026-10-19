import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { SetupGuard, ManagementGuard, EmployeeGuard, GuestGuard } from '@/components/guards';
import { ManagementLayout } from '@/components/layout/management-layout';
import { EmployeeLayout } from '@/components/layout/employee-layout';

import Home from '@/pages/home';
import SetupPage from '@/pages/setup';
import ManagementLogin from '@/pages/management-login';
import EmployeeLogin from '@/pages/employee-login';
import ActivatePage from '@/pages/activate';

import ManagementDashboard from '@/pages/management/dashboard';
import EmployeeDashboard from '@/pages/employee/dashboard';
import EmployeeProfileSelfPage from '@/pages/employee/my-profile';
import EmployeeAttendancePage from '@/pages/employee/attendance';
import EmployeeLeavePage from '@/pages/employee/leave';
import EmployeeProjectsPage from '@/pages/employee/projects';
import EmployeeFundRequestsPage from '@/pages/employee/fund-requests';
import EmployeeQueriesPage from '@/pages/employee/queries';
import EmployeeWorkReportsPage from '@/pages/employee/work-reports';
import ManagementWorkReportsPage from '@/pages/management/work-reports';
import EmployeePoliciesPage from '@/pages/employee/policies';
import EmployeeAnnouncementsPage from '@/pages/employee/announcements';
import EmployeeKnowledgeBasePage from '@/pages/employee/knowledge-base';
import EmployeeSettingsPage from '@/pages/employee/settings';
import ManagementAttendancePage from '@/pages/management/attendance';
import ManagementLeavePage from '@/pages/management/leave';
import ManagementProjectsPage from '@/pages/management/projects';
import ManagementFundRequestsPage from '@/pages/management/fund-requests';
import ManagementInvoicesPage from '@/pages/management/invoices';
import ManagementAnnouncementsPage from '@/pages/management/announcements';
import ManagementQueriesPage from '@/pages/management/queries';
import ManagementPoliciesPage from '@/pages/management/policies';

// Future imports for Mgmt
import EmployeesPage from '@/pages/management/employees';
import EmployeeProfilePage from '@/pages/management/employee-profile';
import UsersPage from '@/pages/management/users';
import DepartmentsPage from '@/pages/management/departments';
import DepartmentDetailPage from '@/pages/management/department-detail';
import ManagementKnowledgeBasePage from '@/pages/management/knowledge-base';
import EmployeeDepartmentsPage from '@/pages/employee/departments';
import SettingsCompanyPage from '@/pages/management/settings-company';
import TeamChatPage from '@/pages/chat';
import TeamChatManagementPage from '@/pages/management/team-chat-management';
import ManagementAppraisalsPage from '@/pages/management/appraisals';
import MyAppraisalsPage from '@/pages/employee/appraisals';
import { EmployeeClientsPage, ManagementClientsPage } from '@/pages/client-workspace';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <SetupGuard>
          <GuestGuard>
            <Home />
          </GuestGuard>
        </SetupGuard>
      </Route>

      <Route path="/setup">
        <SetupGuard>
          <GuestGuard>
            <SetupPage />
          </GuestGuard>
        </SetupGuard>
      </Route>

      <Route path="/management-login">
        <SetupGuard>
          <GuestGuard>
            <ManagementLogin />
          </GuestGuard>
        </SetupGuard>
      </Route>

      <Route path="/employee-login">
        <SetupGuard>
          <GuestGuard>
            <EmployeeLogin />
          </GuestGuard>
        </SetupGuard>
      </Route>

      <Route path="/activate/:token">
        <SetupGuard>
          <GuestGuard>
            <ActivatePage />
          </GuestGuard>
        </SetupGuard>
      </Route>

      {/* Employee Routes */}
      <Route path="/employee">
        <EmployeeGuard>
          <EmployeeLayout>
            <EmployeeDashboard />
          </EmployeeLayout>
        </EmployeeGuard>
      </Route>
      {([
        ["/employee/profile", EmployeeProfileSelfPage],
        ["/employee/attendance", EmployeeAttendancePage],
        ["/employee/leave", EmployeeLeavePage],
        ["/employee/projects", EmployeeProjectsPage],
        ["/employee/fund-requests", EmployeeFundRequestsPage],
        ["/employee/queries", EmployeeQueriesPage],
        ["/employee/work-reports", EmployeeWorkReportsPage],
        ["/employee/policies", EmployeePoliciesPage],
        ["/employee/departments", EmployeeDepartmentsPage],
        ["/employee/clients", EmployeeClientsPage],
        ["/employee/announcements", EmployeeAnnouncementsPage],
        ["/employee/knowledge-base", EmployeeKnowledgeBasePage],
        ["/employee/settings", EmployeeSettingsPage],
        ["/employee/chat", TeamChatPage],
        ["/employee/appraisals", MyAppraisalsPage],
      ] as const).map(([path, Page]) => (
        <Route key={path} path={path}>
          <EmployeeGuard>
            <EmployeeLayout>
              <Page />
            </EmployeeLayout>
          </EmployeeGuard>
        </Route>
      ))}

      {/* Management Routes */}
      <Route path="/dashboard">
        <ManagementGuard>
          <ManagementLayout>
            <ManagementDashboard />
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route path="/employees">
        <ManagementGuard>
          <ManagementLayout>
            <EmployeesPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route path="/employees/:id">
        <ManagementGuard>
          <ManagementLayout>
            <EmployeeProfilePage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route path="/users">
        <ManagementGuard>
          <ManagementLayout>
            <UsersPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route path="/departments">
        <ManagementGuard>
          <ManagementLayout>
            <DepartmentsPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route path="/departments/:id">
        <ManagementGuard>
          <ManagementLayout>
            <DepartmentDetailPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>
      <Route path="/team-chat-management">
        <ManagementGuard>
          <ManagementLayout>
            <TeamChatManagementPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route path="/settings/company">
        <ManagementGuard>
          <ManagementLayout>
            <SettingsCompanyPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>
      
      {([
        ["/attendance", ManagementAttendancePage],
        ["/leave", ManagementLeavePage],
        ["/projects", ManagementProjectsPage],
        ["/fund-requests", ManagementFundRequestsPage],
        ["/invoices", ManagementInvoicesPage],
        ["/work-reports", ManagementWorkReportsPage],
        ["/queries", ManagementQueriesPage],
        ["/clients", ManagementClientsPage],
        ["/announcements", ManagementAnnouncementsPage],
        ["/knowledge-base", ManagementKnowledgeBasePage],
        ["/policies", ManagementPoliciesPage],
        ["/chat", TeamChatPage],
        ["/appraisals", ManagementAppraisalsPage],
      ] as const).map(([path, Page]) => (
        <Route key={path} path={path}>
          <ManagementGuard>
            <ManagementLayout>
              <Page />
            </ManagementLayout>
          </ManagementGuard>
        </Route>
      ))}

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
