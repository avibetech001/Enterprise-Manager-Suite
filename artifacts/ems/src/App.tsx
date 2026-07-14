import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// Future imports for Mgmt
import EmployeesPage from '@/pages/management/employees';
import UsersPage from '@/pages/management/users';
import DepartmentsPage from '@/pages/management/departments';
import SettingsCompanyPage from '@/pages/management/settings-company';

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

      <Route path="/settings/company">
        <ManagementGuard>
          <ManagementLayout>
            <SettingsCompanyPage />
          </ManagementLayout>
        </ManagementGuard>
      </Route>
      
      <Route path="/settings/attendance">
        <ManagementGuard>
          <ManagementLayout>
            <div className="p-6">
              <h1 className="text-3xl font-bold tracking-tight">Attendance Settings</h1>
              <p className="text-muted-foreground mt-4">Coming soon.</p>
            </div>
          </ManagementLayout>
        </ManagementGuard>
      </Route>
      
      <Route path="/reports">
        <ManagementGuard>
          <ManagementLayout>
            <div className="p-6">
              <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
              <p className="text-muted-foreground mt-4">Coming soon.</p>
            </div>
          </ManagementLayout>
        </ManagementGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
