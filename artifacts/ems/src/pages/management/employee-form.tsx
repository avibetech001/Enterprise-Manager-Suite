import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Employee, EmploymentType, EmploymentStatus } from "@workspace/api-client-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useListDepartments, useListEmployees } from "@workspace/api-client-react";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  otherName: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  maritalStatus: z.string().optional(),
  nationality: z.string().optional(),
  phone: z.string().min(1, "WhatsApp/Phone is required"),
  personalEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  companyEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  residentialAddress: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  profilePhotoUrl: z.string().optional(),
  emergencyContact: z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional()
  }).optional().refine(
    (ec) => {
      if (!ec) return true;
      const anyFilled = !!(ec.name || ec.relationship || ec.phone || ec.address);
      if (!anyFilled) return true;
      return !!(ec.name && ec.relationship && ec.phone);
    },
    { message: "Emergency contact needs a name, relationship, and phone number." }
  ),
  departmentId: z.coerce.number().optional().nullable(),
  jobTitle: z.string().optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).optional().nullable(),
  reportingManagerId: z.coerce.number().optional().nullable(),
  startDate: z.string().optional(),
  employmentStatus: z.enum(["probation", "active", "on_leave", "suspended", "terminated"]).optional()
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  initialData?: Employee | null;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function EmployeeForm({ initialData, onSubmit, onCancel, isSubmitting }: EmployeeFormProps) {
  const { data: departments } = useListDepartments();
  const { data: employees } = useListEmployees();

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      otherName: "",
      gender: "",
      dateOfBirth: "",
      maritalStatus: "",
      nationality: "",
      phone: "",
      personalEmail: "",
      companyEmail: "",
      residentialAddress: "",
      state: "",
      city: "",
      profilePhotoUrl: "",
      emergencyContact: {
        name: "",
        relationship: "",
        phone: "",
        address: ""
      },
      departmentId: null,
      jobTitle: "",
      employmentType: null,
      reportingManagerId: null,
      startDate: "",
      employmentStatus: "active"
    }
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        firstName: initialData.firstName,
        lastName: initialData.lastName,
        otherName: initialData.otherName || "",
        gender: initialData.gender || "",
        dateOfBirth: initialData.dateOfBirth ? initialData.dateOfBirth.split('T')[0] : "",
        maritalStatus: initialData.maritalStatus || "",
        nationality: initialData.nationality || "",
        phone: initialData.phone,
        personalEmail: initialData.personalEmail || "",
        companyEmail: initialData.companyEmail || "",
        residentialAddress: initialData.residentialAddress || "",
        state: initialData.state || "",
        city: initialData.city || "",
        profilePhotoUrl: initialData.profilePhotoUrl || "",
        emergencyContact: initialData.emergencyContact || {
          name: "", relationship: "", phone: "", address: ""
        },
        departmentId: initialData.employment.departmentId,
        jobTitle: initialData.employment.jobTitle || "",
        employmentType: initialData.employment.employmentType || null,
        reportingManagerId: initialData.employment.reportingManagerId,
        startDate: initialData.employment.startDate ? initialData.employment.startDate.split('T')[0] : "",
        employmentStatus: initialData.employment.employmentStatus || "active",
      });
    }
  }, [initialData, form]);

  const handleSubmit = (values: EmployeeFormValues) => {
    const payload: any = { ...values };
    
    // Clean up empty strings to undefined or null based on API requirements
    if (!payload.otherName) delete payload.otherName;
    if (!payload.gender) delete payload.gender;
    if (!payload.dateOfBirth) delete payload.dateOfBirth;
    if (!payload.maritalStatus) delete payload.maritalStatus;
    if (!payload.nationality) delete payload.nationality;
    if (!payload.personalEmail) delete payload.personalEmail;
    if (!payload.companyEmail) delete payload.companyEmail;
    if (!payload.residentialAddress) delete payload.residentialAddress;
    if (!payload.state) delete payload.state;
    if (!payload.city) delete payload.city;
    if (!payload.profilePhotoUrl) delete payload.profilePhotoUrl;
    if (!payload.jobTitle) delete payload.jobTitle;
    if (!payload.startDate) delete payload.startDate;
    
    if (payload.emergencyContact) {
      const ec = payload.emergencyContact;
      if (!ec.name && !ec.relationship && !ec.phone && !ec.address) {
        delete payload.emergencyContact;
      } else if (!ec.address) {
        delete ec.address;
      }
    }

    if (!payload.employmentStatus) {
      payload.employmentStatus = "active";
    }

    onSubmit(payload);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full">
        <ScrollArea className="flex-1 px-1">
          <div className="space-y-6 pb-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-medium">Personal Information</h3>
              <p className="text-sm text-muted-foreground mb-4">Basic details about the employee.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem><FormLabel>First Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem><FormLabel>Last Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="otherName" render={({ field }) => (
                  <FormItem><FormLabel>Other Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="gender" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem><FormLabel>Date of Birth</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="maritalStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marital Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Single">Single</SelectItem>
                        <SelectItem value="Married">Married</SelectItem>
                        <SelectItem value="Divorced">Divorced</SelectItem>
                        <SelectItem value="Widowed">Widowed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nationality" render={({ field }) => (
                  <FormItem><FormLabel>Nationality</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone (WhatsApp) <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="personalEmail" render={({ field }) => (
                  <FormItem><FormLabel>Personal Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="residentialAddress" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Residential Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="state" render={({ field }) => (
                  <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </div>

            <Separator />

            {/* Employment Information */}
            <div>
              <h3 className="text-lg font-medium">Employment Details</h3>
              <p className="text-sm text-muted-foreground mb-4">Role and department information.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="companyEmail" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Company Email</FormLabel>
                    <FormControl><Input type="email" {...field} placeholder="Auto-generated if left blank" /></FormControl>
                    <FormDescription>Leave blank to auto-generate based on name.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                
                <FormField control={form.control} name="departmentId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value?.toString() || "none"} onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {departments?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                
                <FormField control={form.control} name="jobTitle" render={({ field }) => (
                  <FormItem><FormLabel>Job Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <FormField control={form.control} name="employmentType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Type</FormLabel>
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not Set</SelectItem>
                        <SelectItem value="full_time">Full Time</SelectItem>
                        <SelectItem value="part_time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="reportingManagerId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reporting Manager</FormLabel>
                    <Select value={field.value?.toString() || "none"} onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {employees?.filter(e => e.id !== initialData?.id).map(e => 
                          <SelectItem key={e.id} value={e.id.toString()}>{e.fullName}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="employmentStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="probation">Probation</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />

              </div>
            </div>

            <Separator />

            {/* Emergency Contact */}
            <div>
              <h3 className="text-lg font-medium">Emergency Contact</h3>
              <p className="text-sm text-muted-foreground mb-4">Optional contact person details.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="emergencyContact.name" render={({ field }) => (
                  <FormItem><FormLabel>Contact Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="emergencyContact.relationship" render={({ field }) => (
                  <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="emergencyContact.phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="emergencyContact.address" render={({ field }) => (
                  <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </div>
          </div>
        </ScrollArea>
        
        <div className="pt-4 mt-2 border-t flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : initialData ? "Save Changes" : "Create Employee"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
