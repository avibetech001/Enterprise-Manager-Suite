import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, getListDepartmentsQueryKey } from "@workspace/api-client-react";
import { Department } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Building2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
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
import { Card, CardContent } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const departmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
  description: z.string().optional(),
});

type DepartmentFormValues = z.infer<typeof departmentSchema>;

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { data: departments, isLoading } = useListDepartments();
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const handleOpenDialog = (dept?: Department) => {
    if (dept) {
      setEditingDepartment(dept);
      form.reset({
        name: dept.name,
        description: dept.description || "",
      });
    } else {
      setEditingDepartment(null);
      form.reset({
        name: "",
        description: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: DepartmentFormValues) => {
    if (editingDepartment) {
      updateDepartment.mutate(
        { id: editingDepartment.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
            toast.success("Department updated successfully");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to update department", {
              description: error.data?.error || "Unknown error occurred"
            });
          }
        }
      );
    } else {
      createDepartment.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
            toast.success("Department created successfully");
            setIsDialogOpen(false);
          },
          onError: (error) => {
            toast.error("Failed to create department", {
              description: error.data?.error || "Unknown error occurred"
            });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this department?")) return;
    
    deleteDepartment.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
          toast.success("Department deleted successfully");
        },
        onError: (error) => {
          toast.error("Failed to delete department", {
            description: error.data?.error || "Cannot delete department with active employees"
          });
        }
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground mt-1">Manage organizational units and teams.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Department
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : departments?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No departments found</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">
            Get started by creating your first department.
          </p>
          <Button variant="outline" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Create Department
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments?.map(dept => (
            <Card key={dept.id} className="flex flex-col">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <Link href={`/departments/${dept.id}`} className="font-semibold text-lg hover:underline">{dept.name}</Link>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleOpenDialog(dept)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(dept.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4 flex-1">
                  {dept.description || "No description provided."}
                </p>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium bg-muted/50 px-3 py-1.5 rounded-md inline-flex">
                    {dept.employeeCount} {dept.employeeCount === 1 ? 'employee' : 'employees'}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/departments/${dept.id}`}>
                      View <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDepartment ? "Edit Department" : "Add Department"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Engineering" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Software development and IT operations" className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createDepartment.isPending || updateDepartment.isPending}>
                  {editingDepartment ? "Save Changes" : "Create Department"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
