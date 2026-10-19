import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClientQueryKey,
  getListClientsQueryKey,
  useCreateClient,
  useCreateClientMaterial,
  useDeleteClientMaterial,
  useGetClient,
  useListClients,
  useGetCurrentSession,
  useUpdateClient,
  type Client,
  type ClientInput,
  type ClientMaterial,
  type ClientMaterialCategory,
  type ClientMaterialInput,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleAlert,
  FileSpreadsheet,
  FileText,
  Globe2,
  Instagram,
  Linkedin,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Paperclip,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES: { value: ClientMaterialCategory; label: string; icon: typeof FileText }[] = [
  { value: "spreadsheet", label: "Spreadsheet", icon: FileSpreadsheet },
  { value: "social_strategy", label: "Social strategy", icon: Instagram },
  { value: "brief", label: "Brief", icon: MessageSquareText },
  { value: "report", label: "Report", icon: FileText },
  { value: "creative", label: "Creative", icon: Paperclip },
  { value: "other", label: "Other", icon: FileText },
];

type ClientForm = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  socialLinks: string;
  summary: string;
};

type MaterialForm = {
  title: string;
  category: ClientMaterialCategory;
  description: string;
  content: string;
};

const blankClient: ClientForm = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  industry: "",
  socialLinks: "",
  summary: "",
};

const blankMaterial: MaterialForm = {
  title: "",
  category: "other",
  description: "",
  content: "",
};

const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Client name is required"),
  contactName: z.string(),
  email: z.string(),
  phone: z.string(),
  website: z.string(),
  industry: z.string(),
  socialLinks: z.string(),
  summary: z.string(),
});

const materialFormSchema = z.object({
  title: z.string().trim().min(1, "Add a title before saving"),
  category: z.enum(["spreadsheet", "social_strategy", "brief", "report", "creative", "other"]),
  description: z.string(),
  content: z.string(),
});

function clientToForm(client: Client): ClientForm {
  return {
    name: client.name,
    contactName: client.contactName || "",
    email: client.email || "",
    phone: client.phone || "",
    website: client.website || "",
    industry: client.industry || "",
    socialLinks: client.socialLinks || "",
    summary: client.summary || "",
  };
}

function toClientInput(form: ClientForm, status: ClientInput["status"]): ClientInput {
  return {
    name: form.name.trim(),
    contactName: form.contactName.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    website: form.website.trim() || null,
    industry: form.industry.trim() || null,
    socialLinks: form.socialLinks.trim() || null,
    summary: form.summary.trim() || null,
    status,
  };
}

function readableDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function categoryDetails(category: ClientMaterialCategory) {
  return CATEGORIES.find((entry) => entry.value === category) || CATEGORIES[CATEGORIES.length - 1];
}

function storageUrl(filePath: string) {
  return `${import.meta.env.BASE_URL}api/storage${filePath}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ManagementClientsPage() {
  return <ClientWorkspace management />;
}

export function EmployeeClientsPage() {
  return <ClientWorkspace management={false} />;
}

function ClientWorkspace({ management }: { management: boolean }) {
  const queryClient = useQueryClient();
  const { data: session } = useGetCurrentSession();
  const canManage = Boolean(
    management &&
      session &&
      (session.user.role === "super_admin" ||
        session.user.permissions.includes("manage_projects")),
  );
  const clientsQuery = useListClients();
  const clients = clientsQuery.data || [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detailQuery = useGetClient(selectedId ?? 0, {
    query: {
      queryKey: getGetClientQueryKey(selectedId ?? 0),
      enabled: selectedId !== null,
    },
  });
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const createMaterial = useCreateClientMaterial();
  const deleteMaterial = useDeleteClientMaterial();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const clientProfileForm = useForm<ClientForm>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: blankClient,
  });
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const materialEntryForm = useForm<MaterialForm>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: blankMaterial,
  });
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (error) => toast.error("Upload failed", { description: error.message }),
  });

  const detail = detailQuery.data;
  const visibleClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return clients
      .filter((client) => statusFilter === "all" || client.status === statusFilter)
      .filter((client) => {
        if (!normalized) return true;
        return [client.name, client.contactName, client.industry, client.email]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, query, statusFilter]);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
  const invalidateDetail = (id: number) =>
    queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });

  const openNewClient = () => {
    setEditingClient(null);
    clientProfileForm.reset(blankClient);
    setClientDialogOpen(true);
  };

  const openEditClient = (client: Client) => {
    setEditingClient(client);
    clientProfileForm.reset(clientToForm(client));
    setClientDialogOpen(true);
  };

  const saveClient = (values: ClientForm) => {
    if (!canManage) return;
    const payload = toClientInput(values, editingClient?.status || "active");
    if (editingClient) {
      updateClient.mutate(
        { id: editingClient.id, data: payload },
        {
          onSuccess: () => {
            invalidateList();
            invalidateDetail(editingClient.id);
            setClientDialogOpen(false);
            toast.success("Client profile updated");
          },
          onError: () => toast.error("Could not update client profile"),
        },
      );
      return;
    }
    createClient.mutate(
      { data: payload },
      {
        onSuccess: (created) => {
          invalidateList();
          setSelectedId(created.id);
          setClientDialogOpen(false);
          toast.success("Client added to workspace");
        },
        onError: () => toast.error("Could not create client profile"),
      },
    );
  };

  const toggleArchived = (client: Client) => {
    if (!canManage) return;
    const nextStatus = client.status === "active" ? "archived" : "active";
    const label = nextStatus === "archived" ? "Archive this client?" : "Restore this client?";
    if (!window.confirm(label)) return;
    updateClient.mutate(
      { id: client.id, data: toClientInput(clientToForm(client), nextStatus) },
      {
        onSuccess: () => {
          invalidateList();
          invalidateDetail(client.id);
          toast.success(nextStatus === "archived" ? "Client archived" : "Client restored");
        },
        onError: () => toast.error("Could not update client status"),
      },
    );
  };

  const openMaterialDialog = (category?: ClientMaterialCategory) => {
    if (!canManage) return;
    materialEntryForm.reset({ ...blankMaterial, category: category || "other" });
    setAttachedFile(null);
    setMaterialDialogOpen(true);
  };

  const onChooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachedFile(event.target.files?.[0] || null);
    event.target.value = "";
  };

  const saveMaterial = async (values: MaterialForm) => {
    if (!canManage || !selectedId) return;
    if (!attachedFile && !values.content.trim()) {
      toast.error("Add note content or choose a file");
      return;
    }
    let uploaded: Awaited<ReturnType<typeof uploadFile>> | undefined;
    if (attachedFile) {
      uploaded = await uploadFile(attachedFile);
      if (!uploaded) return;
    }
    const payload: ClientMaterialInput = {
      title: values.title.trim(),
      category: values.category,
      description: values.description.trim() || null,
      content: attachedFile ? null : values.content.trim() || null,
      filePath: uploaded?.objectPath || null,
      fileName: attachedFile?.name || null,
      contentType: attachedFile
        ? attachedFile.type || "application/octet-stream"
        : null,
    };
    createMaterial.mutate(
      { id: selectedId, data: payload },
      {
        onSuccess: () => {
          invalidateDetail(selectedId);
          setMaterialDialogOpen(false);
          toast.success(attachedFile ? "File added to client record" : "Note added to client record");
        },
        onError: () => toast.error("Could not save this client material"),
      },
    );
  };

  const removeMaterial = (material: ClientMaterial) => {
    if (!canManage || !selectedId || !window.confirm(`Remove “${material.title}” from this client record?`)) return;
    deleteMaterial.mutate(
      { id: selectedId, materialId: material.id },
      {
        onSuccess: () => {
          invalidateDetail(selectedId);
          toast.success("Material removed");
        },
        onError: () => toast.error("Could not remove this material"),
      },
    );
  };

  const isSavingClient = createClient.isPending || updateClient.isPending;
  const isSavingMaterial = createMaterial.isPending || isUploading;

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-5 text-foreground sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-8 -top-14 h-64 w-64 rounded-full border border-primary/10 sm:right-8 sm:top-[-100px] sm:h-80 sm:w-80" />
          <div className="pointer-events-none absolute right-10 top-8 h-44 w-44 rounded-full border border-primary/10 sm:right-28 sm:top-1 sm:h-60 sm:w-60" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.19em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                5th Element · {management ? "Management workspace" : "Team directory"}
              </div>
              <h1 className="font-serif text-4xl leading-none tracking-tight sm:text-5xl">
                Client <span className="italic text-primary">workspace</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                {management
                  ? "Every relationship, brief and working file—kept together, ready for the next good idea."
                  : "A shared reference for the people, context and work behind every client relationship."}
              </p>
            </div>
            {canManage && (
              <Button onClick={openNewClient} className="h-11 shrink-0 rounded-xl px-5" data-testid="button-add-client">
                <Plus className="mr-2 h-4 w-4" />
                Add client
              </Button>
            )}
          </div>
          <div className="relative mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-border/80 pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="stat-client-count">
              <UsersRound className="h-4 w-4 text-primary" />
              <strong className="font-mono text-sm font-medium text-foreground">
                {clients.filter((client) => client.status === "active").length.toString().padStart(2, "0")}
              </strong>
              active relationships
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="stat-material-count">
              <FileText className="h-4 w-4 text-primary" />
              <strong className="font-mono text-sm font-medium text-foreground">
                {clients.length}
              </strong>
              client records
            </div>
            <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Internal staff access
            </div>
          </div>
        </header>

        <section className="grid min-h-[620px] gap-5 lg:grid-cols-[minmax(290px,360px)_minmax(0,1fr)]">
          <aside className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:min-h-[680px]">
            <div className="border-b border-border px-4 pb-4 pt-5 sm:px-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Directory</p>
                  <p className="mt-1 text-sm font-medium" data-testid="text-directory-count">
                    {visibleClients.length} {visibleClients.length === 1 ? "client" : "clients"}
                  </p>
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger className="h-8 w-[124px] rounded-lg text-xs" data-testid="select-client-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="all">All clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a client or contact"
                  className="h-10 rounded-xl border-border bg-background pl-9 text-sm"
                  data-testid="input-search-clients"
                  aria-label="Search clients"
                />
                {query && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    data-testid="button-clear-client-search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1.5 p-2.5">
                {clientsQuery.isLoading ? (
                  <div className="space-y-2 p-2" data-testid="state-clients-loading">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <div key={index} className="flex items-center gap-3 rounded-xl px-2 py-3">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : clientsQuery.isError ? (
                  <div className="px-4 py-12 text-center" data-testid="state-clients-error">
                    <CircleAlert className="mx-auto mb-3 h-7 w-7 text-destructive" />
                    <p className="text-sm font-medium">The directory could not load.</p>
                    <p className="mt-1 text-xs text-muted-foreground">Your client records are safe. Try again.</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => clientsQuery.refetch()} data-testid="button-retry-clients">
                      Retry
                    </Button>
                  </div>
                ) : visibleClients.length === 0 ? (
                  <div className="px-4 py-12 text-center" data-testid="state-clients-empty">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary">
                      {query ? <Search className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                    </div>
                    <p className="text-sm font-semibold">{query ? "No matches found" : "No client records yet"}</p>
                    <p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 text-muted-foreground">
                      {query ? "Try another name, industry or contact." : management ? "Add a client to give the team one dependable place to start." : "Client records will appear here when they are added."}
                    </p>
                    {canManage && !query && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={openNewClient} data-testid="button-empty-add-client">
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first client
                      </Button>
                    )}
                  </div>
                ) : (
                  visibleClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedId(client.id)}
                      className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                        selectedId === client.id
                          ? "border-primary/25 bg-primary/[0.07]"
                          : "border-transparent hover:border-border hover:bg-muted/60"
                      }`}
                      data-testid={`button-select-client-${client.id}`}
                      aria-pressed={selectedId === client.id}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-medium ${
                        selectedId === client.id ? "bg-primary text-primary-foreground" : "bg-muted text-primary"
                      }`}>
                        {initials(client.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{client.name}</span>
                          {client.status === "archived" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {client.contactName || client.industry || client.email || "Client profile"}
                        </span>
                      </span>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${
                        selectedId === client.id ? "translate-x-0.5 text-primary" : "text-muted-foreground/50 group-hover:translate-x-0.5"
                      }`} />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:px-5">
              <span>Workspace index</span>
              <span className="font-mono">{String(clients.length).padStart(2, "0")} records</span>
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {!selectedId ? (
              <div className="flex min-h-[560px] flex-col items-center justify-center px-6 py-16 text-center" data-testid="state-client-unselected">
                <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-[28px] border border-primary/15 bg-primary/[0.05]">
                  <Building2 className="h-9 w-9 text-primary" strokeWidth={1.3} />
                  <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card">
                    <ArrowDownToLine className="h-4 w-4 text-primary" />
                  </span>
                </div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">One shared source</p>
                <h2 className="font-serif text-3xl tracking-tight">Choose a client</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Client context, contact details and every working material live together here.
                </p>
                {canManage && clients.length === 0 && !clientsQuery.isLoading && (
                  <Button onClick={openNewClient} variant="outline" className="mt-6 rounded-xl" data-testid="button-start-client-profile">
                    <Plus className="mr-2 h-4 w-4" /> Create a client profile
                  </Button>
                )}
              </div>
            ) : detailQuery.isLoading ? (
              <div className="space-y-6 p-6 sm:p-8" data-testid="state-client-detail-loading">
                <Skeleton className="h-8 w-2/5" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
            ) : detailQuery.isError ? (
              <div className="flex min-h-[560px] flex-col items-center justify-center px-6 text-center" data-testid="state-client-detail-error">
                <CircleAlert className="mb-3 h-8 w-8 text-destructive" />
                <h2 className="text-lg font-semibold">Client record unavailable</h2>
                <p className="mt-1 text-sm text-muted-foreground">There was a problem opening this profile.</p>
                <Button variant="outline" className="mt-4" onClick={() => detailQuery.refetch()} data-testid="button-retry-client-detail">
                  Retry
                </Button>
              </div>
            ) : detail?.client ? (
              <ClientProfile
                client={detail.client}
                materials={detail.materials || []}
                management={canManage}
                onEdit={() => openEditClient(detail.client)}
                onArchive={() => toggleArchived(detail.client)}
                onAddMaterial={openMaterialDialog}
                onRemoveMaterial={removeMaterial}
                isRemovingMaterial={deleteMaterial.isPending}
              />
            ) : (
              <div className="p-8 text-sm text-muted-foreground" data-testid="state-client-detail-empty">
                This client record has no detail to display.
              </div>
            )}
          </section>
        </section>
      </div>

      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-3xl tracking-tight">
              {editingClient ? "Edit client profile" : "Add a client"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Capture the useful context once. The whole team can pick it up from here.
            </p>
          </DialogHeader>
          <Form {...clientProfileForm}>
            <form
              onSubmit={clientProfileForm.handleSubmit(saveClient, () => toast.error("Client name is required"))}
              className="space-y-5 py-2"
            >
              <FormField
                control={clientProfileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company / client name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input id="client-name" autoFocus {...field} placeholder="e.g. Northline Studio" data-testid="input-client-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={clientProfileForm.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary contact</FormLabel>
                      <FormControl>
                        <Input id="client-contact" {...field} placeholder="Contact name" data-testid="input-client-contact" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientProfileForm.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry</FormLabel>
                      <FormControl>
                        <Input id="client-industry" {...field} placeholder="e.g. Hospitality" data-testid="input-client-industry" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientProfileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input id="client-email" type="email" {...field} placeholder="name@company.com" data-testid="input-client-email" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientProfileForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input id="client-phone" type="tel" {...field} placeholder="+1 555 000 0000" data-testid="input-client-phone" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientProfileForm.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input id="client-website" type="url" {...field} placeholder="https://" data-testid="input-client-website" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={clientProfileForm.control}
                name="socialLinks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Social links</FormLabel>
                    <FormControl>
                      <Textarea id="client-social" {...field} placeholder={"One URL per line\nhttps://instagram.com/yourclient"} className="min-h-20 resize-y" data-testid="input-client-social-links" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Add each channel on a new line.</p>
                  </FormItem>
                )}
              />
              <FormField
                control={clientProfileForm.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background &amp; working context</FormLabel>
                    <FormControl>
                      <Textarea id="client-summary" {...field} placeholder="What should a teammate know before picking up this relationship?" className="min-h-28 resize-y" data-testid="input-client-summary" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={() => setClientDialogOpen(false)} data-testid="button-cancel-client">Cancel</Button>
                <Button type="submit" disabled={isSavingClient} data-testid="button-save-client">
                  {isSavingClient && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                  {editingClient ? "Save profile" : "Add client"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-3xl tracking-tight">Add to the record</DialogTitle>
            <p className="text-sm text-muted-foreground">A note, brief or file—keep it close to the client context.</p>
          </DialogHeader>
          <Form {...materialEntryForm}>
            <form
              onSubmit={materialEntryForm.handleSubmit(saveMaterial, () => toast.error("Add a title before saving"))}
              className="space-y-4 py-2"
            >
              <FormField
                control={materialEntryForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input id="material-title" {...field} placeholder="e.g. Q3 content direction" data-testid="input-material-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={materialEntryForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-material-category"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={materialEntryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description <span className="text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Input id="material-description" {...field} placeholder="A short note to help the team scan it" data-testid="input-material-description" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={materialEntryForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note content</FormLabel>
                    <FormControl>
                      <Textarea id="material-content" {...field} placeholder="Paste useful context, feedback or decisions here." className="min-h-32 resize-y" disabled={!!attachedFile} data-testid="input-material-content" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4">
                <input ref={fileInputRef} type="file" className="hidden" onChange={onChooseFile} data-testid="input-material-file" />
                {attachedFile ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Paperclip className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{attachedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(attachedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setAttachedFile(null)} aria-label="Remove attached file" data-testid="button-remove-material-file">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Upload className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-medium">Attach a working file</p>
                        <p className="text-xs text-muted-foreground">Spreadsheets, PDFs, images and more</p>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-choose-material-file">
                      <Paperclip className="mr-2 h-3.5 w-3.5" /> Browse files
                    </Button>
                  </div>
                )}
              </div>
              {attachedFile && <p className="text-xs text-muted-foreground">The file will be saved as the material; note content is disabled while a file is attached.</p>}
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={() => setMaterialDialogOpen(false)} data-testid="button-cancel-material">Cancel</Button>
                <Button type="submit" disabled={isSavingMaterial || createMaterial.isPending} data-testid="button-save-material">
                  {isSavingMaterial && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                  {attachedFile ? "Upload and save" : "Save note"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ClientProfile({
  client,
  materials,
  management,
  onEdit,
  onArchive,
  onAddMaterial,
  onRemoveMaterial,
  isRemovingMaterial,
}: {
  client: Client;
  materials: ClientMaterial[];
  management: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onAddMaterial: (category?: ClientMaterialCategory) => void;
  onRemoveMaterial: (material: ClientMaterial) => void;
  isRemovingMaterial: boolean;
}) {
  const socialLinks = (client.socialLinks || "")
    .split(/[\n,]+/)
    .map((link) => link.trim())
    .filter(Boolean);
  const visibleMaterials = [...materials].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="min-w-0">
      <div className="border-b border-border px-5 py-6 sm:px-8 sm:py-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span>Client record</span><ChevronRight className="h-3 w-3" />
            <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
              client.status === "active" ? "border-primary/20 bg-primary/[0.07] text-primary" : "border-border bg-muted text-muted-foreground"
            }`} data-testid={`status-client-${client.id}`}>
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${client.status === "active" ? "bg-primary" : "bg-muted-foreground"}`} />
              {client.status}
            </Badge>
          </div>
          {management && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={onArchive} data-testid={`button-${client.status === "active" ? "archive" : "restore"}-client-${client.id}`}>
                <Archive className="mr-2 h-3.5 w-3.5" />
                {client.status === "active" ? "Archive" : "Restore"}
              </Button>
              <Button size="sm" className="h-9 rounded-lg" onClick={onEdit} data-testid={`button-edit-client-${client.id}`}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit profile
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl bg-primary text-base font-mono font-medium text-primary-foreground sm:h-[68px] sm:w-[68px] sm:text-lg">
            {initials(client.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl" data-testid={`text-client-name-${client.id}`}>{client.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {client.industry && <span>{client.industry}</span>}
              {client.industry && client.contactName && <span className="text-border">/</span>}
              {client.contactName && <span>{client.contactName}</span>}
              {!client.industry && !client.contactName && <span>Client profile</span>}
            </div>
          </div>
        </div>
        {client.summary ? (
          <p className="mt-6 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-foreground/80" data-testid={`text-client-summary-${client.id}`}>{client.summary}</p>
        ) : (
          <p className="mt-6 text-sm italic text-muted-foreground" data-testid={`text-client-summary-${client.id}`}>No background notes yet.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {client.email && (
            <a href={`mailto:${client.email}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-primary" data-testid={`link-client-email-${client.id}`}>
              <Mail className="h-3.5 w-3.5 text-primary" />{client.email}
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-primary" data-testid={`link-client-phone-${client.id}`}>
              <MessageSquareText className="h-3.5 w-3.5 text-primary" />{client.phone}
            </a>
          )}
          {client.website && (
            <a href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-primary" data-testid={`link-client-website-${client.id}`}>
              <Globe2 className="h-3.5 w-3.5 text-primary" />Website<ArrowUpRight className="h-3 w-3" />
            </a>
          )}
          {socialLinks.map((link, index) => {
            const href = link.startsWith("http") ? link : `https://${link}`;
            const network = link.toLowerCase().includes("instagram") ? "Instagram" : link.toLowerCase().includes("linkedin") ? "LinkedIn" : link.toLowerCase().includes("facebook") ? "Facebook" : "Social";
            const Icon = network === "Instagram" ? Instagram : network === "LinkedIn" ? Linkedin : Globe2;
            return (
              <a key={`${link}-${index}`} href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-foreground transition-colors hover:border-primary/30 hover:text-primary" data-testid={`link-client-social-${client.id}-${index}`}>
                <Icon className="h-3.5 w-3.5 text-primary" />{network}<ArrowUpRight className="h-3 w-3" />
              </a>
            );
          })}
        </div>
      </div>

      <section className="px-5 py-6 sm:px-8 sm:py-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Relationship library
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <h3 className="font-serif text-3xl tracking-tight">Working materials</h3>
              <span className="font-mono text-xs text-muted-foreground" data-testid={`text-material-count-${client.id}`}>{String(materials.length).padStart(2, "0")}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Briefs, decisions and files in one shared place.</p>
          </div>
          {management && (
            <Button onClick={() => onAddMaterial()} variant="outline" className="h-9 rounded-lg" data-testid={`button-add-material-${client.id}`}>
              <Plus className="mr-2 h-4 w-4" /> Add material
            </Button>
          )}
        </div>

        {visibleMaterials.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/25 px-5 py-12 text-center" data-testid={`state-materials-empty-${client.id}`}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-semibold">Nothing in the library yet</h4>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              Add the first brief, strategy note or file so the next person has the full picture.
            </p>
            {management && (
              <Button onClick={() => onAddMaterial()} variant="outline" size="sm" className="mt-4" data-testid={`button-empty-add-material-${client.id}`}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add the first material
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleMaterials.map((material) => {
              const category = categoryDetails(material.category);
              const Icon = category.icon;
              const hasFile = Boolean(material.filePath);
              return (
                <Card
                  key={material.id}
                  className="group overflow-hidden rounded-xl border-border bg-background shadow-none transition-colors hover:border-primary/25"
                  data-testid={`card-client-material-${material.id}`}
                >
                  <CardContent className="flex items-start gap-3.5 p-4 sm:items-center sm:px-5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      hasFile ? "bg-primary/10 text-primary" : "bg-muted text-foreground/70"
                    }`}>
                      <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="text-sm font-semibold" data-testid={`text-material-title-${material.id}`}>{material.title}</h4>
                        <Badge variant="secondary" className="h-5 rounded-md bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{category.label}</Badge>
                      </div>
                      {material.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{material.description}</p>}
                      {material.content && <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{material.content}</p>}
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        {material.uploadedByName ? `Added by ${material.uploadedByName} · ` : ""}
                        {readableDate(material.createdAt)}
                        {material.fileName && <span className="ml-2 font-mono">{material.fileName}</span>}
                      </p>
                    </div>
                    {hasFile && material.filePath && (
                      <a
                        href={storageUrl(material.filePath)}
                        download={material.fileName || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                        data-testid={`link-download-material-${material.id}`}
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" /><span className="hidden sm:inline">Open file</span>
                      </a>
                    )}
                    {management && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => onRemoveMaterial(material)}
                        disabled={isRemovingMaterial}
                        aria-label={`Remove ${material.title}`}
                        data-testid={`button-delete-material-${material.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[10px] text-muted-foreground">
          <span data-testid={`text-client-updated-${client.id}`}>Updated {readableDate(client.updatedAt)}</span>
          <span>Created {readableDate(client.createdAt)}</span>
        </div>
      </section>
    </div>
  );
}
