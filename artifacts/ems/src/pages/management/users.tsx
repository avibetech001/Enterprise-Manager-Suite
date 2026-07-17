import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListManagementUsers, 
  useCreateManagementUser, 
  useUpdateManagementUser, 
  useDeleteManagementUser, 
  useListPermissions,
  getListManagementUsersQueryKey,
  useGetCurrentSession
} from "@workspace/api-client-react";
import { ManagementUser, PermissionKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Shield, MoreHorizontal, ShieldCheck } from "lucide-react";
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
  FormDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const userSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  password: z.string().optional(),
  role: z.enum(["super_admin", "hr"]),
  permissions: z.array(z.string()).optional(),
  status: z.enum(["active", "pending", "inactive", "suspended"]).optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListManagementUsers();
  const { data: permissions } = useListPermissions();
  const { data: session } = useGetCurrentSession();
  
  const createUser = useCreateManagementUser();
  const updateUser = useUpdateManagementUser();
  const deleteUser = useDeleteManagementUser();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagementUser | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      role: "hr",
      permissions: [],
    },
  });

  const handleOpenDialog = (user?: ManagementUser) => {
    if (user) {
      setEditingUser(user);
      form.reset({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role === "super_admin" ? "super_admin" : "hr",
        permissions: user.permissions || [],
        status: user.status,
      });
    } else {
      setEditingUser(null);
      form.reset({
        fullName: "",
        email: "",
        phone: "",
        role: "hr",
        permissions: [],
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: UserFormValues) => {
    if (editingUser) {
      const { password: _password, email: _email, ...rest } = data;
      const payload = {
        ...rest,
        permissions: data.permissions as PermissionKey[],
      };
      updateUser.mutate(
        { id: editingUser.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListManagementUsersQueryKey() });
            toast.success("User updated successfully");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to update user", {
              description: error.data?.error || "Unknown error occurred"
            });
          }
        }
      );
    } else {
      if (!data.password || data.password.length < 8) {
        form.setError("password", {
          message: "Password must be at least 8 characters",
        });
        return;
      }
      createUser.mutate(
        {
          data: {
            fullName: data.fullName,
            email: data.email,
            phone: data.phone,
            password: data.password,
            role: data.role,
            permissions: data.permissions as PermissionKey[],
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListManagementUsersQueryKey() });
            toast.success("User created successfully");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to create user", {
              description: error.data?.error || "Unknown error occurred"
            });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this management user?")) return;
    
    deleteUser.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListManagementUsersQueryKey() });
          toast.success("User deleted successfully");
        },
        onError: (error) => {
          toast.error("Failed to delete user", {
            description: error.data?.error || "Unknown error occurred"
          });
        }
      }
    );
  };

  const currentUserId = session?.user?.id;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Management Users</h1>
          <p className="text-muted-foreground mt-1">Manage HR staff and their access permissions.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[70px] rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No management users found.
                </TableCell>
              </TableRow>
            ) : (
              users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium flex items-center gap-2">
                      {user.fullName}
                      {user.id === currentUserId && (
                        <Badge variant="outline" className="text-[10px] uppercase h-5">You</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'super_admin' ? 'default' : 'secondary'} className="capitalize">
                      {user.role === 'super_admin' ? 'Admin' : user.role.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.role === 'super_admin' ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        Full Access
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {user.permissions?.length > 0 ? (
                          user.permissions.slice(0, 2).map(p => (
                            <Badge key={p} variant="outline" className="text-[10px] font-normal">
                              {permissions?.find(def => def.key === p)?.label || p}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No extra permissions</span>
                        )}
                        {user.permissions?.length > 2 && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            +{user.permissions.length - 2} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={user.status === "active" ? "default" : "secondary"}
                      className={
                        user.status === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : ""
                      }
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.id !== currentUserId &&
                      (user.role !== 'super_admin' || session?.user?.role === 'super_admin') && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDialog(user)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit User & Permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(user.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@company.com" {...field} disabled={!!editingUser} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="hr">HR (selected permissions only)</SelectItem>
                        <SelectItem value="super_admin">Admin (full access)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
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
                
                {!editingUser && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {editingUser && (
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
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className={form.watch("role") === "super_admin" ? "hidden" : "space-y-4 pt-4 border-t"}>
                <div>
                  <h3 className="text-sm font-medium mb-1">Access Permissions</h3>
                  <p className="text-xs text-muted-foreground">Select the modules this user can manage.</p>
                </div>
                
                <FormField
                  control={form.control}
                  name="permissions"
                  render={() => (
                    <FormItem>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {permissions?.map((permission) => (
                          <FormField
                            key={permission.key}
                            control={form.control}
                            name="permissions"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={permission.key}
                                  className="flex flex-row items-start space-x-3 space-y-0 border p-3 rounded-md bg-muted/30"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(permission.key)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...(field.value || []), permission.key])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== permission.key
                                              )
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-medium cursor-pointer">
                                      {permission.label}
                                    </FormLabel>
                                    <FormDescription className="text-xs">
                                      {permission.description}
                                    </FormDescription>
                                  </div>
                                </FormItem>
                              )
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                  {editingUser ? "Save Changes" : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
