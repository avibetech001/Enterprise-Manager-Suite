import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListPostsQueryKey,
  useCreatePost,
  useDeletePost,
  useListPosts,
  type CompanyPost,
  type CompanyPostInput,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  CircleAlert,
  File,
  FileText,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const KB_CATEGORIES = [
  { value: "idea_dump", label: "Idea Dump" },
  { value: "samples", label: "Samples" },
  { value: "strategy", label: "Strategy" },
] as const;

type PostKind = "knowledge_base" | "policy";
type UploadMeta = { objectPath: string };

const categoryName = (value: string | null) =>
  KB_CATEGORIES.find((category) => category.value === value)?.label ?? value;

function storageUrl(filePath: string) {
  return `${import.meta.env.BASE_URL}api/storage${filePath}`;
}

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeUrl(raw: string) {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function videoEmbed(link: string) {
  try {
    const url = new URL(normalizeUrl(link));
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
      const shortsId = url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
      if (shortsId) return `https://www.youtube-nocookie.com/embed/${shortsId}`;
    }
    if (host === "vimeo.com") {
      const id = url.pathname.match(/\/(\d+)/)?.[1];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

function PostAttachment({ post }: { post: CompanyPost }) {
  if (!post.attachmentPath) return null;
  const url = storageUrl(post.attachmentPath);
  const type = post.attachmentContentType || "";
  const name = post.attachmentFileName || "Attached file";
  const lowerName = name.toLowerCase();
  const isVideo =
    type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/.test(lowerName);
  const isImage =
    type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(lowerName);
  if (isVideo) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
        <video className="max-h-[520px] w-full bg-foreground" controls preload="metadata" src={url}>
          Your browser does not support embedded video.
        </video>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Video className="h-3.5 w-3.5" /> {name}
        </div>
      </div>
    );
  }
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl border border-border bg-muted/50">
        <img src={url} alt={name} className="max-h-[520px] w-full object-contain" loading="lazy" />
        <span className="flex items-center gap-2 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> {name} <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
        </span>
      </a>
    );
  }
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <iframe title={name} src={url} className="h-[min(65vh,620px)] w-full bg-muted" />
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-primary hover:underline">
          <FileText className="h-4 w-4" /> {name} <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
        </a>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/35 p-3 transition-colors hover:bg-muted/70">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><File className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">Download attachment</span>
      </span>
      <ArrowDownToLine className="h-4 w-4 text-primary" />
    </a>
  );
}

function LinkPreview({ link }: { link: string | null }) {
  if (!link) return null;
  const url = normalizeUrl(link);
  const embed = videoEmbed(link);
  if (embed) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="aspect-video bg-foreground">
          <iframe className="h-full w-full" src={embed} title="Linked video preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-primary">
          <Link2 className="h-3.5 w-3.5" /> Open original video <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
        </a>
      </div>
    );
  }
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* retain the entered URL */ }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-primary/[0.035] p-3 transition-colors hover:bg-primary/[0.08]">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/10 bg-card text-primary"><Link2 className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{host}</span>
        <span className="mt-0.5 block break-all text-xs text-muted-foreground">{link}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
    </a>
  );
}

function PostCard({ post, management, onDelete, deleting }: {
  post: CompanyPost;
  management: boolean;
  onDelete?: (id: number) => void;
  deleting?: boolean;
}) {
  return (
    <article className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary sm:flex">
          {post.attachmentContentType?.startsWith("video/") ? <Video className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl leading-snug tracking-tight sm:text-2xl">{post.title}</h2>
            {categoryName(post.category) && <Badge variant="outline" className="rounded-full border-primary/15 bg-primary/[0.04] font-medium text-primary">{categoryName(post.category)}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{management ? "Published" : "Shared"} {safeDate(post.createdAt)}</span>
            {post.createdByName && <span className="before:mr-3 before:text-border before:content-['·']">By {post.createdByName}</span>}
          </div>
        </div>
        {management && onDelete && (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(post.id)} disabled={deleting} aria-label={`Delete ${post.title}`}>
            {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {post.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{post.body}</p>}
      <PostAttachment post={post} />
      <LinkPreview link={post.link} />
    </article>
  );
}

export default function CompanyPostsWorkspace({ kind, management, hideHeader = false }: { kind: PostKind; management: boolean; hideHeader?: boolean }) {
  const isKnowledge = kind === "knowledge_base";
  const params = useMemo(() => ({ kind }), [kind]);
  const queryKey = getListPostsQueryKey(params);
  const queryClient = useQueryClient();
  const postsQuery = useListPosts(params, { query: { queryKey } });
  const createPost = useCreatePost();
  const deletePost = useDeletePost();
  const { uploadFile, isUploading } = useUpload({
    onError: (error) => toast.error("Upload failed", { description: error.message }),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("idea_dump");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const posts = postsQuery.data || [];
  const filteredPosts = posts.filter((post) => {
    if (filterCategory && post.category !== filterCategory) return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${post.title} ${post.body} ${post.createdByName || ""}`.toLowerCase().includes(needle);
  });
  const pending = createPost.isPending || isUploading;

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selected) return;
    if (selected.size > 100 * 1024 * 1024) {
      toast.error("Choose a file smaller than 100 MB.");
      return;
    }
    setFile(selected);
  };

  const resetForm = () => {
    setTitle("");
    setBody("");
    setCategory("idea_dump");
    setLink("");
    setFile(null);
    setShowForm(false);
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Add a title before publishing.");
      return;
    }
    if (!body.trim() && !link.trim() && !file) {
      toast.error("Add some details, a link, or an attachment.");
      return;
    }
    if (link.trim()) {
      try {
        const parsed = new URL(normalizeUrl(link.trim()));
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Invalid protocol");
      } catch {
        toast.error("Enter a valid web address for the link.");
        return;
      }
    }
    let uploaded: UploadMeta | undefined;
    if (file) {
      const result = await uploadFile(file);
      if (!result?.objectPath) return;
      uploaded = result;
    }
    const payload: CompanyPostInput = {
      kind,
      ...(isKnowledge ? { category: category as CompanyPostInput["category"] } : {}),
      title: title.trim(),
      body: body.trim(),
      link: link.trim() ? normalizeUrl(link.trim()) : null,
      attachmentPath: uploaded?.objectPath || null,
      attachmentFileName: file?.name || null,
      attachmentContentType: file ? file.type || "application/octet-stream" : null,
    };
    createPost.mutate({ data: payload }, {
      onSuccess: () => {
        toast.success(isKnowledge ? "Idea shared with the team." : "Policy published.");
        resetForm();
        queryClient.invalidateQueries({ queryKey });
      },
      onError: () => toast.error(isKnowledge ? "Could not share this idea." : "Could not publish this policy."),
    });
  };

  const remove = (id: number) => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    deletePost.mutate({ id }, {
      onSuccess: () => {
        toast.success("Post deleted.");
        queryClient.invalidateQueries({ queryKey });
      },
      onError: () => toast.error("Could not delete this post."),
    });
  };

  const titleText = isKnowledge ? "Idea Dump" : "Company Policies";
  return (
    <main className={hideHeader ? "text-foreground" : "min-h-[100dvh] bg-background px-4 py-5 text-foreground sm:px-7 sm:py-8 lg:px-10"}>
      <div className={hideHeader ? "space-y-6" : "mx-auto max-w-[1120px] space-y-6"}>
        {!hideHeader && <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-8 -top-14 h-64 w-64 rounded-full border border-primary/10 sm:right-8 sm:top-[-100px] sm:h-80 sm:w-80" />
          <div className="pointer-events-none absolute right-10 top-8 h-44 w-44 rounded-full border border-primary/10 sm:right-28 sm:top-1 sm:h-60 sm:w-60" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.19em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                5th Element · {management ? "Management workspace" : "Team knowledge"}
              </div>
              <h1 className="font-serif text-4xl leading-none tracking-tight sm:text-5xl">
                {titleText.split(" ")[0]} <span className="italic text-primary">{titleText.split(" ").slice(1).join(" ")}</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                {isKnowledge
                  ? management ? "A useful home for ideas, examples and the small things that make good work repeatable." : "Share a thought, working tip or example. Useful ideas get better when everyone can find them."
                  : management ? "Keep the rules clear, current and easy for every colleague to reach." : "The current guidance for how we work together. Keep this close when questions come up."}
              </p>
            </div>
            {management && (
              <Button onClick={() => setShowForm((open) => !open)} className="h-11 shrink-0 rounded-xl px-5">
                {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {showForm ? "Close form" : isKnowledge ? "Add an idea" : "Publish policy"}
              </Button>
            )}
            {!management && isKnowledge && (
              <Button onClick={() => setShowForm((open) => !open)} className="h-11 shrink-0 rounded-xl px-5">
                {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {showForm ? "Close form" : "Share an idea"}
              </Button>
            )}
          </div>
          <div className="relative mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-border/80 pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isKnowledge ? <BookOpen className="h-4 w-4 text-primary" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
              <strong className="font-mono text-sm font-medium text-foreground">{String(posts.length).padStart(2, "0")}</strong>
              {isKnowledge ? "shared entries" : "published policies"}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Paperclip className="h-4 w-4 text-primary" />
              Shared company reference
            </div>
            <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" /> Updated as the team adds knowledge
            </div>
          </div>
        </header>}

        {showForm && (
          <Card className="overflow-hidden rounded-2xl border-primary/15 shadow-sm">
            <div className="border-b border-border bg-primary/[0.035] px-5 py-4 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-primary">New {isKnowledge ? "team contribution" : "company guidance"}</p>
              <h2 className="mt-1 font-serif text-2xl tracking-tight">{isKnowledge ? "Put a good idea somewhere useful." : "Make the policy easy to follow."}</h2>
            </div>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className={`grid gap-4 ${isKnowledge ? "sm:grid-cols-[minmax(0,1fr)_220px]" : ""}`}>
                <div className="space-y-2">
                  <Label htmlFor={`${kind}-title`}>Title <span className="text-destructive">*</span></Label>
                  <Input id={`${kind}-title`} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isKnowledge ? "e.g. A simple way to prep for shoot day" : "e.g. Annual leave and time off"} className="h-11 rounded-xl" />
                </div>
                {isKnowledge && (
                  <div className="space-y-2">
                    <Label htmlFor="post-category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="post-category" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{KB_CATEGORIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${kind}-body`}>Details</Label>
                <Textarea id={`${kind}-body`} value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={12000} placeholder={isKnowledge ? "Add the context someone would need to put this into practice…" : "Write the policy in clear, practical language…"} className="resize-y rounded-xl leading-6" />
                <p className="text-right text-[11px] text-muted-foreground">{body.length.toLocaleString()} / 12,000</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(250px,0.9fr)]">
                <div className="space-y-2">
                  <Label htmlFor={`${kind}-link`}>Useful link <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id={`${kind}-link`} value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" className="h-11 rounded-xl" inputMode="url" />
                </div>
                <div className="space-y-2">
                  <Label>Attachment <span className="font-normal text-muted-foreground">(optional, max 100 MB)</span></Label>
                  <input ref={fileRef} type="file" className="sr-only" onChange={selectFile} accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" aria-label="Choose an attachment" />
                  {file ? (
                    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3">
                      <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                      <button type="button" aria-label="Remove attachment" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setFile(null)}><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/25 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.035] hover:text-primary">
                      <Upload className="h-4 w-4" /> Choose file
                    </button>
                  )}
                </div>
              </div>
              {isUploading && (
                <div role="status" className="flex items-center gap-2 rounded-lg bg-primary/[0.06] px-3 py-2 text-sm text-primary">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Uploading {file?.name}…
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button variant="outline" className="rounded-xl" onClick={resetForm} disabled={pending}>Cancel</Button>
                <Button className="rounded-xl px-5" onClick={submit} disabled={pending || !title.trim()}>
                  {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {isUploading ? "Uploading…" : createPost.isPending ? "Publishing…" : isKnowledge ? "Share with the team" : "Publish policy"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(management || isKnowledge) && (
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={`Search ${titleText.toLowerCase()}`} placeholder={isKnowledge ? "Search ideas, notes and contributors" : "Search policies"} value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-xl bg-card pl-9" />
          </div>
        )}
        {isKnowledge && (
          <div className="flex flex-wrap gap-2" aria-label="Filter ideas by category">
            <Button variant={filterCategory === null ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setFilterCategory(null)}>All ideas</Button>
            {KB_CATEGORIES.map((item) => (
              <Button key={item.value} variant={filterCategory === item.value ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setFilterCategory(filterCategory === item.value ? null : item.value)}>{item.label}</Button>
            ))}
          </div>
        )}

        {postsQuery.isLoading ? (
          <div className="space-y-3" aria-label="Loading posts">
            {[0, 1, 2].map((item) => <div key={item} className="rounded-2xl border border-border bg-card p-5"><Skeleton className="h-5 w-2/5" /><Skeleton className="mt-3 h-3 w-1/3" /><Skeleton className="mt-6 h-16 w-full" /></div>)}
          </div>
        ) : postsQuery.isError ? (
          <div className="rounded-2xl border border-destructive/20 bg-card px-6 py-12 text-center">
            <CircleAlert className="mx-auto h-8 w-8 text-destructive" />
            <h2 className="mt-3 font-serif text-2xl">This page could not load.</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your shared information is safe. Please try again.</p>
            <Button variant="outline" className="mt-5 rounded-xl" onClick={() => postsQuery.refetch()}>Retry</Button>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary">
              {search ? <Search className="h-6 w-6" /> : isKnowledge ? <BookOpen className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
            </div>
            <h2 className="mt-4 font-serif text-2xl">{search || filterCategory ? "Nothing matches those filters" : isKnowledge ? "A good idea can start here." : "No policies published yet."}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {search || filterCategory ? "Try a different search or clear the category filter." : isKnowledge ? "Add the first practical tip, resource or example for the team." : "When management publishes a policy, the latest guidance will appear here."}
            </p>
            {!search && !filterCategory && (management || isKnowledge) && (
              <Button variant="outline" className="mt-5 rounded-xl" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />{isKnowledge ? "Share an idea" : "Publish the first policy"}</Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => <PostCard key={post.id} post={post} management={management} onDelete={management ? remove : undefined} deleting={deletePost.isPending} />)}
          </div>
        )}
      </div>
    </main>
  );
}
