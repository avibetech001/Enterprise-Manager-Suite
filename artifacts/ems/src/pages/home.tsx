import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Building2, Users } from "lucide-react";
import logo from "@/assets/logo.svg";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center text-center mb-12">
          <img src={logo} alt="5th Element" className="h-12 w-auto mb-8" />
          <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-4">
            Enterprise Management System
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            Select your portal to log in.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Link href="/management-login" className="group">
            <div className="h-full bg-card border border-border rounded-xl p-8 transition-all hover:border-primary/50 hover:shadow-md cursor-pointer flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Building2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Management Portal</h2>
              <p className="text-sm text-muted-foreground mb-6">
                For Employers and HR staff to manage the organization.
              </p>
              <Button className="w-full mt-auto" variant="outline">
                Management Login
              </Button>
            </div>
          </Link>

          <Link href="/employee-login" className="group">
            <div className="h-full bg-card border border-border rounded-xl p-8 transition-all hover:border-primary/50 hover:shadow-md cursor-pointer flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Users className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Employee Portal</h2>
              <p className="text-sm text-muted-foreground mb-6">
                For employees to access their profile and workspace.
              </p>
              <Button className="w-full mt-auto" variant="outline">
                Employee Login
              </Button>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
