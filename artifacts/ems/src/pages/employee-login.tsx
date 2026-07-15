import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useEmployeeLogin } from "@workspace/api-client-react";
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

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function EmployeeLoginPage() {
  const [, setLocation] = useLocation();
  const employeeLogin = useEmployeeLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(data: LoginFormValues) {
    employeeLogin.mutate({ data }, {
      onSuccess: () => {
        setLocation("/employee");
      },
      onError: (err) => {
        toast.error("Login failed", {
          description: err.data?.error || "Invalid credentials or unauthorized access."
        });
      }
    });
  }

  return (
    <AuthLayout 
      title="Employee Login" 
      subtitle="Sign in to your workspace."
    >
      <Card className="shadow-lg border-border">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="employee@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={employeeLogin.isPending}>
                {employeeLogin.isPending ? "Authenticating..." : "Sign in"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="mt-4 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to portal selection
        </Link>
      </div>
    </AuthLayout>
  );
}
