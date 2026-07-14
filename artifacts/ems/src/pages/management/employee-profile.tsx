import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { 
  useGetEmployee, 
  useUpdateEmployee,
  useResetEmployeePassword,
  useResendEmployeeActivation,
  useArchiveEmployee,
  useRestoreEmployee,
  useListDepartments,
  useListEmployees,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  MoreHorizontal, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  Building2, 
  Calendar,
  UserCircle2,
  Clock,
  Shield,
  Key,
  Archive,
  RefreshCw,
  Ban,
  CheckCircle2,
  Copy
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { EmployeeForm } from "./employee-form";

export default function EmployeeProfilePage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: employee, isLoading, isError } = useGetEmployee(id, {
    query: { enabled: !!id, queryKey: getGetEmployeeQueryKey(id) }
  });
  
  const { data: departments } = useListDepartments();
  // Fetch all employees to find the reporting manager
  const { data: employees } = useListEmployees();

  const updateEmployee = useUpdateEmployee();
  const resetPassword = useResetEmployeePassword();
  const resendActivation = useResendEmployeeActivation();
  const archiveEmployee = useArchiveEmployee();
  const restoreEmployee = useRestoreEmployee();

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);

  if (isError) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Employee Not Found</h2>
        <p className="text-muted-foreground mb-4">The employee you are looking for does not exist or you don't have permission to view them.</p>
        <Button onClick={() => setLocation("/employees")} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Directory
        </Button>
      </div>
    );
  }

  const getDepartmentName = (deptId: number | null) => {
    if (!deptId) return "No Department";
    return departments?.find(d => d.id === deptId)?.name || "Unknown Department";
  };

  const handleStatusChange = (newStatus: "active" | "inactive" | "suspended") => {
    updateEmployee.mutate(
      { id, data: { accountStatus: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast.success(`Account marked as ${newStatus}`);
        },
        onError: (err) => {
          toast.error("Failed to update status", { description: err.data?.error || "Unknown error" });
        }
      }
    );
  };

  const handleArchiveToggle = () => {
    if (employee?.archived) {
      restoreEmployee.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast.success("Employee restored from archive");
        }
      });
    } else {
      archiveEmployee.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast.success("Employee archived");
        }
      });
    }
  };

  const handleResetPassword = () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    
    resetPassword.mutate(
      { id, data: { newPassword } },
      {
        onSuccess: () => {
          setPasswordDialogOpen(false);
          setNewPassword("");
          toast.success("Password reset successfully");
        },
        onError: (err) => {
          toast.error("Failed to reset password", { description: err.data?.error || "Unknown error" });
        }
      }
    );
  };

  const handleResendLink = () => {
    resendActivation.mutate(
      { id },
      {
        onSuccess: (res) => {
          setActivationLink(res.activationLink);
          toast.success("Activation link generated");
        },
        onError: (err) => {
          toast.error("Failed to generate link", { description: err.data?.error || "Unknown error" });
        }
      }
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleEditSubmit = (data: any) => {
    updateEmployee.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast.success("Employee updated successfully");
          setIsEditFormOpen(false);
        },
        onError: (err) => {
          toast.error("Failed to update employee", { description: err.data?.error || "Unknown error" });
        }
      }
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/employees")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {isLoading ? <Skeleton className="h-8 w-48" /> : employee?.fullName}
            </h1>
            {!isLoading && employee && (
              <>
                <Badge variant={employee.accountStatus === "active" ? "default" : "secondary"}>
                  {employee.accountStatus}
                </Badge>
                {employee.archived && <Badge variant="destructive">Archived</Badge>}
              </>
            )}
          </div>
          <div className="text-muted-foreground mt-1">
            {isLoading ? <Skeleton className="h-4 w-32" /> : employee?.employeeCode}
          </div>
        </div>
        
        {!isLoading && employee && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsEditFormOpen(true)}>
                <UserCircle2 className="mr-2 h-4 w-4" /> Edit Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)}>
                <Key className="mr-2 h-4 w-4" /> Reset Password
              </DropdownMenuItem>
              {employee.accountStatus === "pending" && (
                <DropdownMenuItem onClick={handleResendLink}>
                  <Mail className="mr-2 h-4 w-4" /> Resend Activation Link
                </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
              
              {employee.accountStatus !== "active" && (
                <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Reactivate Account
                </DropdownMenuItem>
              )}
              {employee.accountStatus === "active" && (
                <DropdownMenuItem onClick={() => handleStatusChange("suspended")}>
                  <Ban className="mr-2 h-4 w-4" /> Suspend Account
                </DropdownMenuItem>
              )}
              {employee.accountStatus !== "inactive" && (
                <DropdownMenuItem onClick={() => handleStatusChange("inactive")}>
                  <Shield className="mr-2 h-4 w-4" /> Deactivate Account
                </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleArchiveToggle} className={employee.archived ? "" : "text-destructive focus:text-destructive"}>
                {employee.archived ? (
                  <><RefreshCw className="mr-2 h-4 w-4" /> Restore Employee</>
                ) : (
                  <><Archive className="mr-2 h-4 w-4" /> Archive Employee</>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                {isLoading ? (
                  <Skeleton className="h-24 w-24 rounded-full" />
                ) : (
                  <Avatar className="h-24 w-24 border-4 border-background shadow-sm">
                    <AvatarImage src={employee?.profilePhotoUrl || undefined} />
                    <AvatarFallback className="text-3xl">{employee?.firstName[0]}{employee?.lastName[0]}</AvatarFallback>
                  </Avatar>
                )}
                
                <div>
                  <h2 className="text-xl font-bold">{isLoading ? <Skeleton className="h-6 w-32 mx-auto" /> : employee?.fullName}</h2>
                  <div className="text-muted-foreground mt-1">
                    {isLoading ? <Skeleton className="h-4 w-24 mx-auto" /> : employee?.employment?.jobTitle || "No Title"}
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm truncate">
                    {isLoading ? <Skeleton className="h-4 w-full" /> : employee?.companyEmail}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm truncate">
                    {isLoading ? <Skeleton className="h-4 w-full" /> : employee?.phone}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm truncate">
                    {isLoading ? <Skeleton className="h-4 w-full" /> : getDepartmentName(employee?.employment?.departmentId || null)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm truncate">
                    {isLoading ? <Skeleton className="h-4 w-full" /> : (
                      <>Joined {employee?.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "Unknown"}</>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Details & Work Summary */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Employment Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mb-1"><Briefcase className="h-3.5 w-3.5" /> Employment Type</div>
                    <div className="font-medium capitalize">{employee?.employment?.employmentType?.replace('_', ' ') || "Not Set"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mb-1"><Clock className="h-3.5 w-3.5" /> Status</div>
                    <div className="font-medium capitalize">{employee?.employment?.employmentStatus.replace('_', ' ')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mb-1"><Calendar className="h-3.5 w-3.5" /> Start Date</div>
                    <div className="font-medium">{employee?.employment?.startDate ? new Date(employee.employment.startDate).toLocaleDateString() : "Not Set"}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4"><Skeleton className="h-16 w-full" /></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Personal Email</div>
                    <div className="font-medium">{employee?.personalEmail || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Gender</div>
                    <div className="font-medium capitalize">{employee?.gender || "—"}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mb-1"><MapPin className="h-3.5 w-3.5" /> Address</div>
                    <div className="font-medium">
                      {[employee?.residentialAddress, employee?.city, employee?.state].filter(Boolean).join(", ") || "—"}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Work Summary (Coming Soon Area) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="bg-muted/30 border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Leave Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground mt-1">Module coming soon</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Attendance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground mt-1">Module coming soon</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-dashed sm:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Assigned Projects & Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-12 flex items-center justify-center border border-dashed rounded text-sm text-muted-foreground">
                  Module coming soon
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input 
                id="new-password" 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPassword.isPending || newPassword.length < 8}>
              {resetPassword.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activation Link Dialog */}
      <Dialog open={!!activationLink} onOpenChange={(open) => !open && setActivationLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Link Generated
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">Share this link with the employee to activate their account.</p>
            <div className="flex gap-2">
              <Input readOnly value={activationLink || ""} className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(activationLink || "")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setActivationLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Employee Dialog */}
      <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
        <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b shrink-0">
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-6 pt-2">
            {employee && (
              <EmployeeForm 
                initialData={employee}
                onSubmit={handleEditSubmit} 
                onCancel={() => setIsEditFormOpen(false)}
                isSubmitting={updateEmployee.isPending}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
