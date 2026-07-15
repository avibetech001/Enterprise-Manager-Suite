import { ReactNode } from "react";
import logo from "@/assets/logo.svg";

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <img src={logo} alt="5th Element" className="h-10 w-auto mb-6" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        
        {children}
        
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            5th Element Enterprise Management System
          </p>
        </div>
      </div>
    </div>
  );
}
