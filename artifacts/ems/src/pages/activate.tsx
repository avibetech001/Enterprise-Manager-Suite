import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLocation, useParams } from "wouter";
import { useGetActivationInfo, useActivateEmployee, getGetActivationInfoQueryKey } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const activationSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
  acceptPolicies: z.literal(true, {
    errorMap: () => ({ message: "You must accept the company policies" })
  })
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ActivationFormValues = z.infer<typeof activationSchema>;

export default function ActivatePage() {
  const params = useParams();
  const token = params.token || "";
  const [, setLocation] = useLocation();
  
  const { data: info, isLoading, isError } = useGetActivationInfo(token, {
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetActivationInfoQueryKey(token)
    }
  });

  const activate = useActivateEmployee();

  const form = useForm<ActivationFormValues>({
    resolver: zodResolver(activationSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  function onSubmit(data: ActivationFormValues) {
    activate.mutate({ data: { token, ...data } }, {
      onSuccess: () => {
        toast.success("Account activated", {
          description: "You have been logged in successfully."
        });
        setLocation("/employee");
      },
      onError: (err) => {
        toast.error("Activation failed", {
          description: err.data?.error || "An unexpected error occurred."
        });
      }
    });
  }

  if (isLoading) {
    return (
      <AuthLayout title="Verifying Link...">
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AuthLayout>
    );
  }

  if (isError || !info) {
    return (
      <AuthLayout title="Invalid Link">
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            This activation link is invalid or has expired. Please contact your administrator.
          </AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout 
      title="Welcome to 5th Element" 
      subtitle={`Set your password to activate your account for ${info.companyName}.`}
    >
      <Card className="shadow-lg border-border">
        <CardContent className="pt-6">
          <div className="bg-muted p-4 rounded-md mb-6 space-y-1">
            <p className="text-sm font-medium">{info.fullName}</p>
            <p className="text-xs text-muted-foreground">{info.email}</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Set Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="acceptPolicies"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mt-0.5"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        I accept the company policies
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={activate.isPending}>
                {activate.isPending ? "Activating..." : "Activate Account"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
