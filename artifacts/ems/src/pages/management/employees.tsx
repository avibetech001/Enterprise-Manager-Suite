import { photoSrc } from "@/lib/photo";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  useListEmployees, 
  useCreateEmployee, 
  useUpdateEmployee, 
  useListDepartments,
  getListEmployeesQueryKey,
  getListDepartmentsQueryKey 
} from "@workspace/api-client-react";
import { Employee } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, Search, Filter, Download, MoreHorizontal, 
  FileSpreadsheet, FileText, CheckCircle2, Copy, 
  MessageCircle, Mail, ArrowUpRight
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { EmployeeForm } from "./employee-form";

export default function EmployeesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [empTypeFilter, setEmpTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  
  const { data: employees, isLoading } = useListEmployees(
    { includeArchived }, 
    { query: { queryKey: getListEmployeesQueryKey({ includeArchived }) } }
  );
  
  const { data: departments } = useListDepartments();
  const createEmployee = useCreateEmployee();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activationLinkInfo, setActivationLinkInfo] = useState<{link: string, phone: string, email: string, id: string} | null>(null);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    
    return employees.filter(emp => {
      // Search
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        emp.fullName.toLowerCase().includes(searchLower) ||
        emp.employeeCode.toLowerCase().includes(searchLower) ||
        emp.companyEmail.toLowerCase().includes(searchLower) ||
        emp.phone.toLowerCase().includes(searchLower) ||
        (emp.employment.jobTitle?.toLowerCase() || "").includes(searchLower);
        
      // Department Filter
      const matchesDept = deptFilter === "all" || emp.employment.departmentId?.toString() === deptFilter;
      
      // Status Filter
      const matchesStatus = statusFilter === "all" || emp.accountStatus === statusFilter;
      
      // Employment Type Filter
      const matchesType = empTypeFilter === "all" || emp.employment.employmentType === empTypeFilter;
      
      return matchesSearch && matchesDept && matchesStatus && matchesType;
    });
  }, [employees, searchQuery, deptFilter, statusFilter, empTypeFilter]);

  const paginatedEmployees = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    return filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEmployees, page]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

  const getDepartmentName = (id: number | null) => {
    if (!id) return "—";
    return departments?.find(d => d.id === id)?.name || "—";
  };

  const handleCreateSubmit = (data: any) => {
    createEmployee.mutate({ data }, {
      onSuccess: (newEmployee) => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey({ includeArchived }) });
        queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
        toast.success("Employee created successfully");
        setIsFormOpen(false);
        if (newEmployee.activationLink) {
          setActivationLinkInfo({
            link: newEmployee.activationLink,
            phone: newEmployee.phone,
            email: newEmployee.companyEmail,
            id: newEmployee.employeeCode
          });
        }
      },
      onError: (err) => {
        toast.error("Failed to create employee", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  // Export functions
  const exportData = filteredEmployees.map(emp => ({
    "Employee Code": emp.employeeCode,
    "Full Name": emp.fullName,
    "Company Email": emp.companyEmail,
    "Phone": emp.phone,
    "Department": getDepartmentName(emp.employment.departmentId),
    "Job Title": emp.employment.jobTitle || "",
    "Employment Type": emp.employment.employmentType || "",
    "Status": emp.employment.employmentStatus,
    "Account Status": emp.accountStatus,
    "Date Joined": new Date(emp.createdAt).toLocaleDateString()
  }));

  const handleExportCSV = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `employees_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
    XLSX.writeFile(workbook, `employees_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Employee Directory", 14, 15);
    
    autoTable(doc, {
      head: [['Code', 'Name', 'Email', 'Department', 'Job Title', 'Status']],
      body: filteredEmployees.map(emp => [
        emp.employeeCode,
        emp.fullName,
        emp.companyEmail,
        getDepartmentName(emp.employment.departmentId),
        emp.employment.jobTitle || "",
        emp.accountStatus
      ]),
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] } // slate-800 to match theme
    });
    
    doc.save(`employees_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="p-6 space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1">Manage employee accounts and employment details.</p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className="h-4 w-4 mr-2" /> Export to CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" /> Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap gap-3 items-center justify-end w-full sm:w-auto">
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <div className="flex items-center gap-2">
                  <Filter className="h-3 w-3 text-muted-foreground" />
                  <SelectValue placeholder="Department" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Account Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={empTypeFilter} onValueChange={setEmpTypeFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Emp. Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center space-x-2 border-l pl-3 ml-1">
              <Switch id="show-archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
              <Label htmlFor="show-archived" className="text-sm whitespace-nowrap cursor-pointer text-muted-foreground">Show Archived</Label>
            </div>
          </div>
        </div>

        <div className="border rounded-md overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Employee</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Reporting To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div><Skeleton className="h-4 w-[150px] mb-1" /><Skeleton className="h-3 w-[80px]" /></div></div></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px] mb-1" /><Skeleton className="h-3 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px] mb-1" /><Skeleton className="h-3 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[70px] rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : paginatedEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No employees found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEmployees.map((emp) => (
                  <TableRow key={emp.id} className="group cursor-pointer" onClick={(e) => {
                    // Prevent navigation if clicking a button/menu
                    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[role="menuitem"]')) return;
                    setLocation(`/employees/${emp.id}`);
                  }}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border bg-muted">
                          <AvatarImage src={photoSrc(emp.profilePhotoUrl)} />
                          <AvatarFallback>{emp.firstName[0]}{emp.lastName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                            {emp.fullName}
                            {emp.archived && <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 ml-1 bg-destructive/10 text-destructive border-transparent">Archived</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{emp.employeeCode}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm truncate max-w-[200px]" title={emp.companyEmail}>{emp.companyEmail}</div>
                      <div className="text-xs text-muted-foreground">{emp.phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{emp.employment.jobTitle || "—"}</div>
                      <div className="text-xs text-muted-foreground flex gap-1 items-center">
                        {getDepartmentName(emp.employment.departmentId)}
                        {emp.employment.employmentType && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-border inline-block"></span>
                            <span className="capitalize">{emp.employment.employmentType.replace('_', ' ')}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge 
                          variant="outline"
                          className={
                            emp.accountStatus === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            emp.accountStatus === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-slate-50 text-slate-700 border-slate-200"
                          }
                        >
                          {emp.accountStatus}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {emp.employment.employmentStatus.replace('_', ' ')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/employees/${emp.id}`} className="cursor-pointer flex w-full">
                              <ArrowUpRight className="h-4 w-4 mr-2" /> View Profile
                            </Link>
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
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length} entries
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="flex items-center justify-center px-4 text-sm font-medium">
                Page {page} of {totalPages}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b shrink-0">
            <DialogTitle>Add New Employee</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-6 pt-2">
            <EmployeeForm 
              onSubmit={handleCreateSubmit} 
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={createEmployee.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activationLinkInfo} onOpenChange={(open) => !open && setActivationLinkInfo(null)}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="flex flex-col items-center pt-8 pb-4 space-y-4">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Employee Created!</h2>
              <p className="text-muted-foreground mt-2 px-6">
                Employee {activationLinkInfo?.id} has been added successfully. Share the activation link below so they can set up their account.
              </p>
            </div>
            
            <div className="bg-muted w-full p-3 rounded-lg border flex items-center gap-2 mt-4">
              <Input readOnly value={activationLinkInfo?.link || ""} className="bg-transparent border-0 focus-visible:ring-0 px-1 font-mono text-sm" />
              <Button variant="secondary" size="icon" className="shrink-0" onClick={() => {
                navigator.clipboard.writeText(activationLinkInfo?.link || "");
                toast.success("Copied to clipboard");
              }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full mt-4">
              <Button variant="outline" className="w-full" asChild>
                <a href={`https://wa.me/${activationLinkInfo?.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Welcome to 5th Element! Here is your activation link: ${activationLinkInfo?.link}`)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </a>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href={`mailto:${activationLinkInfo?.email}?subject=Welcome to 5th Element&body=${encodeURIComponent(`Please use this link to activate your account: \n\n${activationLinkInfo?.link}`)}`}>
                  <Mail className="h-4 w-4 mr-2" />
                  Email Link
                </a>
              </Button>
            </div>
          </div>
          <DialogFooter className="border-t pt-4 w-full">
            <Button className="w-full" onClick={() => setActivationLinkInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
