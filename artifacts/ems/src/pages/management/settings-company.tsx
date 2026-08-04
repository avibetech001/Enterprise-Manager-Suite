import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetCompany, 
  useUpdateCompany,
  getGetCompanyQueryKey,
  useGetCurrentSession,
  useListHolidays,
  useCreateHoliday,
  useDeleteHoliday,
  getListHolidaysQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { ChangePasswordCard } from "@/components/change-password-card";

const companySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  phone: z.string().min(1, "Phone number is required"),
  vision: z.string().optional(),
  mission: z.string().optional(),
  coreValues: z.string().optional(),
  annualLeaveDays: z.coerce.number().min(0, "Must be 0 or more"),
});

type CompanyFormValues = z.infer<typeof companySchema>;

function HolidaysCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { data: holidays, isLoading } = useListHolidays();
  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListHolidaysQueryKey() });

  const onAdd = () => {
    if (!date || !name.trim()) {
      toast.error("Enter both a date and a holiday name.");
      return;
    }
    createHoliday.mutate(
      { data: { date, name: name.trim() } },
      {
        onSuccess: () => {
          setDate("");
          setName("");
          refresh();
          toast.success("Holiday added");
        },
        onError: (error) =>
          toast.error("Failed to add holiday", {
            description: error.data?.error || "Unknown error occurred",
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Holidays</CardTitle>
        <CardDescription>
          Days listed here don't count against employees' leave balances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                placeholder="e.g. Independence Day"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={onAdd}
              disabled={createHoliday.isPending}
            >
              {createHoliday.isPending ? "Adding..." : "Add Holiday"}
            </Button>
          </div>
        )}
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : !holidays || holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No public holidays added yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {holidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${h.date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${h.name}`}
                    disabled={deleteHoliday.isPending}
                    onClick={() =>
                      deleteHoliday.mutate(
                        { id: h.id },
                        {
                          onSuccess: () => refresh(),
                          onError: (error) =>
                            toast.error("Failed to delete holiday", {
                              description:
                                error.data?.error || "Unknown error occurred",
                            }),
                        },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsCompanyPage() {
  const queryClient = useQueryClient();
  const { data: session } = useGetCurrentSession();
  const { data: company, isLoading } = useGetCompany();
  const updateCompany = useUpdateCompany();

  const isSuperAdmin = session?.user?.role === "super_admin";
  const canManageSettings =
    isSuperAdmin ||
    (session?.user?.permissions ?? []).includes("manage_company_settings");

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      vision: "",
      mission: "",
      coreValues: "",
      annualLeaveDays: 0,
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        name: company.name,
        email: company.email || "",
        phone: company.phone || "",
        vision: company.vision || "",
        mission: company.mission || "",
        coreValues: company.coreValues || "",
        annualLeaveDays: company.annualLeaveDays ?? 0,
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

      <PushNotificationsCard />

      <ChangePasswordCard />

      <HolidaysCard canManage={canManageSettings} />

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
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-none">Workspace Domain</p>
                  <div className="flex w-full max-w-sm items-center space-x-2">
                    <Input value={company?.domain || ""} disabled />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    System identifier. Cannot be changed.
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t space-y-6">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">Culture &amp; Policies</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Shape how your organization presents itself and how leave is allocated.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="vision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vision</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Our vision is..." className="resize-none" {...field} disabled={!isSuperAdmin} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mission</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Our mission is..." className="resize-none" {...field} disabled={!isSuperAdmin} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="coreValues"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Core Values</FormLabel>
                      <FormControl>
                        <Textarea placeholder="List your core values..." className="resize-none" {...field} disabled={!isSuperAdmin} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="annualLeaveDays"
                  render={({ field }) => (
                    <FormItem className="max-w-xs">
                      <FormLabel>Annual Leave Days</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} disabled={!isSuperAdmin} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
