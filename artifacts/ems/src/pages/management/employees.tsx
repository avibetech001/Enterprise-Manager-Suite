import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListEmployees, 
  useCreateEmployee, 
  useUpdateEmployee, 
  useDeleteEmployee, 
  useResendEmployeeActivation,
  useListDepartments,
  getListEmployeesQueryKey 
} from "@workspace/api-client-react";
import { Employee } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Mail, Copy, CheckCircle2, MoreHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const employeeSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  departmentId: z.coerce.number().nullable().optional(),
  jobTitle: z.string().optional(),
  status: z.enum(["active", "pending", "inactive"]).optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const { data: employees, isLoading } = useListEmployees();
  const { data: departments } = useListDepartments();
  
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const resendActivation = useResendEmployeeActivation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [activationLink, setActivationLink] = useState<string | null>(null);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      departmentId: null,
      jobTitle: "",
    },
  });

  const handleOpenDialog = (emp?: Employee) => {
    setActivationLink(null);
    if (emp) {
      setEditingEmployee(emp);
      form.reset({
        fullName: emp.fullName,
        email: emp.email,
        phone: emp.phone,
        departmentId: emp.departmentId,
        jobTitle: emp.jobTitle || "",
        status: emp.status,
      });
    } else {
      setEditingEmployee(null);
      form.reset({
        fullName: "",
        email: "",
        phone: "",
        departmentId: null,
        jobTitle: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: EmployeeFormValues) => {
    if (editingEmployee) {
      updateEmployee.mutate(
        { id: editingEmployee.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
            toast.success("Employee updated successfully");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to update employee", {
              description: error.data?.error || "Unknown error occurred"
            });
          }
        }
      );
    } else {
      createEmployee.mutate(
        { data },
        {
          onSuccess: (newEmployee) => {
            queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
            toast.success("Employee created successfully");
            if (newEmployee.activationLink) {
              setActivationLink(newEmployee.activationLink);
            } else {
              setIsDialogOpen(false);
            }
          },
          onError: (error) => {
            toast.error("Failed to create employee", {
              description: error.data?.error || "Unknown error occurred"
            });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this employee?")) return;
    
    deleteEmployee.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast.success("Employee deleted successfully");
        },
        onError: (error) => {
          toast.error("Failed to delete employee", {
            description: error.data?.error || "Unknown error occurred"
          });
        }
      }
    );
  };

  const handleResendLink = (id: number) => {
    resendActivation.mutate(
      { id },
      {
        onSuccess: (result) => {
          setActivationLink(result.activationLink);
          toast.success("Activation link generated");
        },
        onError: (error) => {
          toast.error("Failed to generate link", {
            description: error.data?.error || "Unknown error occurred"
          });
        }
      }
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied to clipboard");
  };

  const getDepartmentName = (id: number | null) => {
    if (!id) return "None";
    return departments?.find(d => d.id === id)?.name || "Unknown";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1">Manage employee accounts and access.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Role / Dept</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[70px] rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : employees?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              employees?.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="font-medium">{emp.fullName}</div>
                    <div className="text-xs text-muted-foreground hidden sm:block">ID: {emp.id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{emp.email}</div>
                    <div className="text-xs text-muted-foreground">{emp.phone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{emp.jobTitle || "—"}</div>
                    <div className="text-xs text-muted-foreground">{getDepartmentName(emp.departmentId)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={emp.status === "active" ? "default" : emp.status === "pending" ? "secondary" : "outline"}
                      className={
                        emp.status === "active" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200" :
                        emp.status === "pending" ? "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200" :
                        ""
                      }
                    >
                      {emp.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDialog(emp)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        {emp.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleResendLink(emp.id)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Get Activation Link
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(emp.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Employee
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Activation Link Modal */}
      <Dialog open={!!activationLink && !isDialogOpen} onOpenChange={(open) => !open && setActivationLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Activation Link Ready
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Share this link with the employee. They will use it to set their password and activate their account.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={activationLink || ""} className="font-mono text-xs" />
              <Button onClick={() => copyToClipboard(activationLink || "")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setActivationLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>

          {activationLink ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Employee Created</h3>
                <p className="text-sm text-muted-foreground mt-1">Copy the activation link below to send to the employee.</p>
              </div>
              <div className="flex w-full gap-2 mt-4">
                <Input readOnly value={activationLink} className="font-mono text-xs bg-muted" />
                <Button variant="outline" onClick={() => copyToClipboard(activationLink)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button className="w-full mt-4" onClick={() => { setIsDialogOpen(false); setActivationLink(null); }}>
                Done
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@company.com" {...field} disabled={!!editingEmployee} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+1..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="jobTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Developer" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="departmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select
                          value={field.value?.toString() || "none"}
                          onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select dept" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {departments?.map(d => (
                              <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {editingEmployee && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Status</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createEmployee.isPending || updateEmployee.isPending}>
                    {editingEmployee ? "Save Changes" : "Create Employee"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
