import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetCompany, 
  useUpdateCompany,
  getGetCompanyQueryKey,
  useGetCurrentSession
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const companySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  phone: z.string().min(1, "Phone number is required"),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export default function SettingsCompanyPage() {
  const queryClient = useQueryClient();
  const { data: session } = useGetCurrentSession();
  const { data: company, isLoading } = useGetCompany();
  const updateCompany = useUpdateCompany();

  const isSuperAdmin = session?.user?.role === "super_admin";

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        name: company.name,
        email: company.email || "",
        phone: company.phone || "",
      });
    }
  }, [company, form]);

  const onSubmit = (data: CompanyFormValues) => {
    updateCompany.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey() });
          toast.success("Company settings updated");
        },
        onError: (error) => {
          toast.error("Failed to update settings", {
            description: error.data?.error || "Unknown error occurred"
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl space-y-6">
        <div>
          <Skeleton className="h-8 w-[200px] mb-2" />
          <Skeleton className="h-4 w-[300px]" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
            <Skeleton className="h-4 w-[250px]" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Company Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your organization's core details.</p>
      </div>

      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>
                These details are used across the system and in employee communications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Corp" {...field} disabled={!isSuperAdmin} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@company.com" {...field} disabled={!isSuperAdmin} />
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
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+1..." {...field} disabled={!isSuperAdmin} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-4 border-t">
                <FormItem>
                  <FormLabel>Workspace Domain</FormLabel>
                  <div className="flex w-full max-w-sm items-center space-x-2">
                    <Input value={company?.domain || ""} disabled />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    System identifier. Cannot be changed.
                  </p>
                </FormItem>
              </div>
            </CardContent>
            {isSuperAdmin && (
              <CardFooter className="border-t px-6 py-4 bg-muted/20">
                <Button type="submit" disabled={updateCompany.isPending}>
                  {updateCompany.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            )}
          </form>
        </Form>
      </Card>
      
      {!isSuperAdmin && (
        <p className="text-sm text-muted-foreground text-center">
          Only the Super Admin can modify company settings.
        </p>
      )}
    </div>
  );
}
