import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListChatGroups,
  getListChatGroupsQueryKey,
  useListChatMessages,
  useListChatGroupMembers,
  getListChatGroupMembersQueryKey,
  useSendChatMessage,
  useDeleteChatMessage,
  getListChatMessagesQueryKey,
  useListPrivateChatContacts,
  getListPrivateChatContactsQueryKey,
  useListPrivateConversations,
  useCreatePrivateConversation,
  getListPrivateConversationsQueryKey,
  useListPrivateMessages,
  getListPrivateMessagesQueryKey,
  useSendPrivateMessage,
  useDeletePrivateMessage,
  useGetCurrentSession,
  type ChatMessage,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  MessagesSquare,
  Paperclip,
  Send,
  X,
  AtSign,
  ArrowLeft,
  Building2,
  Users,
  FileText,
  Reply,
  Trash2,
  Mic,
  Square,
  CornerDownLeft,
  MessageCircle,
  Download,
  ExternalLink,
  Globe2,
} from "lucide-react";

// Render message text with clickable links.
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const cleanUrl = part.replace(/[),.!?;:]+$/, "");
          const href = /^https?:\/\//i.test(cleanUrl)
            ? cleanUrl
            : `https://${cleanUrl}`;
          return (
            <span key={i}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {cleanUrl}
              </a>
              {part.slice(cleanUrl.length)}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

type LinkPreviewData = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

function LinkPreviewCard({ text, mine }: { text: string; mine: boolean }) {
  const match = text.match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i)?.[0];
  const rawUrl = match?.replace(/[),.!?;:]+$/, "");
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || isVisible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible, url.toString()]);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    setPreview(null);
    setImageFailed(false);

    fetch(
      `${import.meta.env.BASE_URL}api/chat/link-preview?url=${encodeURIComponent(url.toString())}`,
      { credentials: "include" },
    )
      .then((response) => {
        if (!response.ok) throw new Error("Link preview unavailable");
        return response.json() as Promise<LinkPreviewData>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        // Keep the domain card available even if the page blocks metadata fetches.
      });

    return () => {
      cancelled = true;
    };
  }, [isVisible, url.toString()]);

  return (
    <a
      ref={cardRef}
      href={url.toString()}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`mt-2 block max-w-[340px] overflow-hidden rounded-md border no-underline transition-colors ${
        mine
          ? "border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/15"
          : "border-border bg-background/70 hover:bg-background"
      }`}
      aria-label={`Open link to ${preview?.title || preview?.siteName || url.hostname}`}
    >
      {preview?.image && !imageFailed && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="max-h-44 w-full object-cover"
        />
      )}
      <div className="p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Globe2 className="h-4 w-4 shrink-0 opacity-75" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {preview?.siteName || url.hostname}
          </span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </div>
        {preview?.title ? (
          <p className="mt-1 line-clamp-2 text-xs font-semibold">{preview.title}</p>
        ) : url.pathname !== "/" ? (
          <p className="mt-1 truncate text-xs opacity-75">{url.pathname}</p>
        ) : null}
        {preview?.description && (
          <p className="mt-1 line-clamp-2 text-xs opacity-75">
            {preview.description}
          </p>
        )}
        <p className="mt-1 text-[10px] opacity-70">{url.hostname}</p>
      </div>
    </a>
  );
}

export default function TeamChatPage() {
  const { data: session } = useGetCurrentSession();
  const { data: groups } = useListChatGroups({
    query: {
      queryKey: getListChatGroupsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const { data: privateConversations } = useListPrivateConversations({
    query: {
      queryKey: getListPrivateConversationsQueryKey(),
      refetchInterval: 4000,
    },
  });
  const { data: privateContacts } = useListPrivateChatContacts({
    query: {
      queryKey: getListPrivateChatContactsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const createPrivateConversation = useCreatePrivateConversation();
  const queryClient = useQueryClient();
  const search = useSearch();

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const updateChatViewport = () => {
      root.style.setProperty(
        "--chat-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      root.style.setProperty(
        "--chat-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };

    updateChatViewport();
    window.addEventListener("resize", updateChatViewport);
    viewport?.addEventListener("resize", updateChatViewport);
    viewport?.addEventListener("scroll", updateChatViewport);

    return () => {
      window.removeEventListener("resize", updateChatViewport);
      viewport?.removeEventListener("resize", updateChatViewport);
      viewport?.removeEventListener("scroll", updateChatViewport);
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-top");
    };
  }, []);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    // Support deep links from notifications: ...chat?group=dept-3
    return new URLSearchParams(window.location.search).get("group");
  });
  const [activeConversationId, setActiveConversationId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("conversation"));
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);

  // Stay in sync with the URL: opening another chat notification while
  // already on this page must switch to the newly linked group.
  useEffect(() => {
    const linked = new URLSearchParams(search).get("group");
    if (linked) setActiveGroupId(linked);
    const linkedConversation = Number(new URLSearchParams(search).get("conversation"));
    if (Number.isInteger(linkedConversation) && linkedConversation > 0) {
      setActiveConversationId(linkedConversation);
      setActiveGroupId(null);
    }
  }, [search]);

  const activeGroup = groups?.find((g) => g.id === activeGroupId) || null;
  const activeConversation =
    privateConversations?.find((conversation) => conversation.id === activeConversationId) || null;
  const selectedContact = (privateContacts || []).find(
    (contact) => String(contact.id) === selectedContactId,
  );

  // Chat view: full-width conversation with a back button.
  if (activeGroup || activeConversation) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start shrink-0"
          onClick={() => {
            setActiveGroupId(null);
            setActiveConversationId(null);
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          All chats
        </Button>
        <GroupChat
          key={activeGroup?.id || `dm-${activeConversation!.id}`}
          groupId={activeGroup?.id}
          privateConversationId={activeConversation?.id}
          groupName={activeGroup?.name || activeConversation!.otherUserName}
          myUserId={session?.user?.id}
          isManagement={session?.user?.role !== "employee"}
          privateIsOnline={activeConversation?.isOnline ?? false}
          privateLastSeenAt={activeConversation?.lastSeenAt ?? null}
        />
      </div>
    );
  }

  // Group list view: click a group to open its chat.
  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team Chat</h1>
        <p className="text-muted-foreground mt-1">
          Tap a group to open its chat.
        </p>
      </div>

      {groups && groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessagesSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No chat groups yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(groups || []).map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveGroupId(g.id)}
            className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {g.kind === "department" ? (
                  <Building2 className="h-5 w-5 text-primary" />
                ) : (
                  <Users className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.kind === "company"
                    ? "Everyone in the company"
                    : g.kind === "team"
                      ? "Role-based team chat"
                      : "Department group"}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Private messages</h2>
          <p className="text-sm text-muted-foreground">
            Conversations are visible only to their two participants.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row">
            <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-0 flex-1 justify-between"
                  aria-label="Choose a coworker"
                >
                  {selectedContact ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{selectedContact.fullName}</span>
                      <PresenceStatus
                        isOnline={selectedContact.isOnline}
                        lastSeenAt={selectedContact.lastSeenAt}
                      />
                    </span>
                  ) : (
                    "Choose a coworker"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] p-1"
              >
                <div className="max-h-64 overflow-y-auto">
                  {(privateContacts || []).map((contact) => (
                    <button
                      type="button"
                      key={contact.id}
                      className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setSelectedContactId(String(contact.id));
                        setContactPickerOpen(false);
                      }}
                    >
                      <span className="truncate">{contact.fullName}</span>
                      <PresenceStatus
                        isOnline={contact.isOnline}
                        lastSeenAt={contact.lastSeenAt}
                      />
                    </button>
                  ))}
                  {(privateContacts || []).length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No active coworkers to message.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              disabled={!selectedContactId || createPrivateConversation.isPending}
              onClick={() => createPrivateConversation.mutate(
                { data: { recipientUserId: Number(selectedContactId) } },
                {
                  onSuccess: (conversation) => {
                    queryClient.invalidateQueries({
                      queryKey: getListPrivateConversationsQueryKey(),
                    });
                    setActiveConversationId(conversation.id);
                    setSelectedContactId("");
                  },
                  onError: () => toast.error("Could not start private conversation"),
                },
              )}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Start private conversation
            </Button>
          </CardContent>
        </Card>
        {(privateConversations || []).length === 0 ? (
          <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            No private conversations yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(privateConversations || []).map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => {
                  setActiveGroupId(null);
                  setActiveConversationId(conversation.id);
                }}
                className="rounded-lg border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium truncate">
                      {conversation.otherUserName}
                    </span>
                    <PresenceStatus
                      isOnline={conversation.isOnline}
                      lastSeenAt={conversation.lastSeenAt}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// "Today", "Yesterday", or a readable date for the day separators.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  if (diffDays === 0) return `Today · ${dateStr}`;
  if (diffDays === 1) return `Yesterday · ${dateStr}`;
  return dateStr;
}

function presenceLabel(
  isOnline: boolean,
  lastSeenAt: Date | string | null | undefined,
): string {
  if (isOnline) return "Online";
  if (!lastSeenAt) return "No activity recorded yet";
  const timestamp = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(timestamp)) return "Last seen unavailable";

  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (elapsedMinutes < 1) return "Last seen just now";
  if (elapsedMinutes < 60) return `Last seen ${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Last seen ${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `Last seen ${elapsedDays}d ago`;
  return `Last seen ${new Date(timestamp).toLocaleDateString()}`;
}

function PresenceStatus({
  isOnline,
  lastSeenAt,
}: {
  isOnline: boolean;
  lastSeenAt: Date | string | null | undefined;
}) {
  if (isOnline) {
    return (
      <Badge className="inline-flex h-5 shrink-0 items-center gap-1 border-emerald-300 bg-emerald-100 px-2 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-label="Offline"
        className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"
      />
      {presenceLabel(isOnline, lastSeenAt)}
    </span>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// A single message bubble with swipe-to-reply, reply preview, delete, voice
// notes, and clickable links.
function MessageBubble({
  m,
  mine,
  canDelete,
  onReply,
  onDelete,
}: {
  m: ChatMessage;
  mine: boolean;
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const triggered = useRef(false);
  const readByNames = m.readByNames ?? [];

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    triggered.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = Math.max(0, Math.min(72, e.clientX - startX.current));
    setDragX(dx);
    if (dx >= 56 && !triggered.current) {
      triggered.current = true;
    }
  };
  const endDrag = () => {
    if (triggered.current) onReply();
    startX.current = null;
    triggered.current = false;
    setDragX(0);
  };

  const fileUrl = m.filePath
    ? `${import.meta.env.BASE_URL}api/storage${m.filePath}`
    : null;
  const isImageAttachment = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(m.fileName || "");
  const canSaveToDevice = /\.(pdf|png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(m.fileName || "");

  return (
    <div className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {mine && (
        <span className="hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
          <ActionButtons canDelete={canDelete} onReply={onReply} onDelete={onDelete} />
        </span>
      )}
      <div
        className={`min-w-0 max-w-[75%] rounded-lg px-3 py-2 text-sm select-none touch-pan-y ${
          mine ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragX ? undefined : "transform 150ms ease",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => startX.current != null && endDrag()}
      >
        {!mine && (
          <p className="text-xs font-medium mb-0.5 opacity-80">{m.userName}</p>
        )}
        {m.replyToId != null && (
          <div
            className={`mb-1.5 rounded border-l-2 px-2 py-1 text-xs ${
              mine
                ? "border-primary-foreground/50 bg-primary-foreground/10"
                : "border-primary/50 bg-background/60"
            }`}
          >
            <p className="font-medium">{m.replyToUserName || "Deleted"}</p>
            <p className="truncate opacity-80">{m.replyToBody || "Message"}</p>
          </div>
        )}
        {m.body && (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text">
            <Linkify text={m.body} />
          </p>
        )}
        {m.body && (
          <LinkPreviewCard text={m.body} mine={mine} />
        )}
        {readByNames.length > 0 && (
          <details className="mt-1 max-w-full text-[10px] opacity-80">
            <summary className="cursor-pointer break-words [overflow-wrap:anywhere]">
              Seen by {readByNames.slice(0, 2).join(", ")}
              {readByNames.length > 2
                ? ` + ${readByNames.length - 2} more`
                : ""}
            </summary>
            <p className="pt-1 break-words [overflow-wrap:anywhere]">
              {readByNames.join(", ")}
            </p>
          </details>
        )}
        {fileUrl && m.kind === "voice" ? (
          <audio controls preload="none" src={fileUrl} className="mt-1 max-w-full h-9" />
        ) : (
          fileUrl && (
            <div
              className={`mt-1 ${
                isImageAttachment
                  ? "flex flex-col items-start gap-1.5"
                  : "flex flex-wrap items-center gap-x-3 gap-y-1"
              }`}
            >
              {isImageAttachment ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block max-w-full"
                  aria-label={`Open image ${m.fileName || "attachment"}`}
                >
                  <img
                    src={fileUrl}
                    alt={m.fileName || "Image attachment"}
                    loading="lazy"
                    decoding="async"
                    className="max-h-72 max-w-full rounded-md object-contain"
                  />
                </a>
              ) : (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-1.5 text-xs underline break-all ${
                    mine ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  {m.fileName || "Attachment"}
                </a>
              )}
              {canSaveToDevice && (
                <a
                  href={fileUrl}
                  download={m.fileName || "attachment"}
                  className={`inline-flex items-center gap-1 text-xs underline whitespace-nowrap ${
                    mine ? "text-primary-foreground" : "text-foreground"
                  }`}
                  aria-label={`Save ${m.fileName || "attachment"} to device`}
                >
                  <Download className="h-3.5 w-3.5" />
                  Save to device
                </a>
              )}
            </div>
          )
        )}
        <p className={`text-[10px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}>
          {new Date(m.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      {!mine && (
        <span className="hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
          <ActionButtons canDelete={canDelete} onReply={onReply} onDelete={onDelete} />
        </span>
      )}
      {/* Mobile: always-visible small actions */}
      <span className="flex sm:hidden gap-0.5">
        <ActionButtons canDelete={canDelete} onReply={onReply} onDelete={onDelete} />
      </span>
    </div>
  );
}

function ActionButtons({
  canDelete,
  onReply,
  onDelete,
}: {
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onReply}
        className="p-1 rounded text-muted-foreground hover:text-foreground"
        title="Reply"
        aria-label="Reply"
      >
        <Reply className="h-3.5 w-3.5" />
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-destructive"
          title="Delete"
          aria-label="Delete message"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}

function GroupChat({
  groupId,
  privateConversationId,
  groupName,
  myUserId,
  isManagement,
  privateIsOnline,
  privateLastSeenAt,
}: {
  groupId?: string;
  privateConversationId?: number;
  groupName: string;
  myUserId?: number;
  isManagement: boolean;
  privateIsOnline: boolean;
  privateLastSeenAt: Date | string | null;
}) {
  const queryClient = useQueryClient();
  const groupMessages = useListChatMessages(groupId || "", {
    query: {
      queryKey: getListChatMessagesQueryKey(groupId || ""),
      refetchInterval: 4000,
      enabled: Boolean(groupId),
    },
  });
  const privateMessages = useListPrivateMessages(privateConversationId || 0, {
    query: {
      queryKey: getListPrivateMessagesQueryKey(privateConversationId || 0),
      refetchInterval: 4000,
      enabled: Boolean(privateConversationId),
    },
  });
  const messages = privateConversationId ? privateMessages.data : groupMessages.data;
  const { data: members } = useListChatGroupMembers(groupId || "", {
    query: {
      queryKey: getListChatGroupMembersQueryKey(groupId || ""),
      enabled: Boolean(groupId),
      refetchInterval: 15_000,
    },
  });
  const sendMessage = useSendChatMessage();
  const sendPrivateMessage = useSendPrivateMessage();
  const deleteMessage = useDeleteChatMessage();
  const deletePrivateMessage = useDeletePrivateMessage();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Array<{
    objectPath: string;
    fileName: string;
  }>>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [mentionAll, setMentionAll] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const maxHeight = 180;
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (err) => toast.error("Upload failed", { description: err.message }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  // Stop the recorder if the user leaves the chat while recording.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const invalidate = () => queryClient.invalidateQueries({
    queryKey: privateConversationId
      ? getListPrivateMessagesQueryKey(privateConversationId)
      : getListChatMessagesQueryKey(groupId || ""),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    input.value = "";
    if (files.length === 0) return;

    setIsBatchUploading(true);
    const uploadedFiles: Array<{ objectPath: string; fileName: string }> = [];
    try {
      for (const file of files) {
        const res = await uploadFile(file);
        if (res) uploadedFiles.push({ objectPath: res.objectPath, fileName: file.name });
      }
      if (uploadedFiles.length > 0) {
        setAttachments((current) => [...current, ...uploadedFiles]);
      }
    } finally {
      setIsBatchUploading(false);
    }
  };

  const handleTag = (userIdStr: string) => {
    const isAll = userIdStr === "__all__";
    const userId = isAll ? null : Number(userIdStr);
    const member = userId === null ? null : members?.find((m) => m.id === userId);
    if (!isAll && (!member || userId === null)) return;

    const input = messageInputRef.current;
    const start = mentionSearch?.start ?? input?.selectionStart ?? text.length;
    const end = mentionSearch?.end ?? input?.selectionEnd ?? start;
    const prefix = start > 0 && !/\s/.test(text[start - 1]) ? " " : "";
    const insertion = `${prefix}@${isAll ? "all" : member!.fullName} `;
    const nextText = `${text.slice(0, start)}${insertion}${text.slice(end)}`;

    if (isAll) {
      setMentionAll(true);
    } else if (userId !== null && !mentionIds.includes(userId)) {
      setMentionIds((ids) => [...ids, userId]);
    }

    setText(nextText);
    setMentionSearch(null);
    setTagOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      const caret = start + insertion.length;
      input?.setSelectionRange(caret, caret);
    });
  };

  const insertLineBreak = () => {
    const input = messageInputRef.current;
    if (!input) {
      setText((current) => `${current}\n`);
      return;
    }
    const start = input.selectionStart;
    const end = input.selectionEnd;
    setText((current) => `${current.slice(0, start)}\n${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + 1, start + 1);
    });
  };

  const sendPayload = async (
    payload: {
      body?: string;
      objectPath?: string;
      fileName?: string;
      kind?: "text" | "voice";
    },
    includeContext = true,
  ): Promise<boolean> => {
    const variables = {
      data: {
        ...payload,
        mentionUserIds:
          privateConversationId || !includeContext || !mentionIds.length
            ? undefined
            : mentionIds,
        mentionAll:
          privateConversationId || !includeContext ? undefined : mentionAll || undefined,
        replyToId: includeContext ? replyTo?.id : undefined,
      },
    };
    try {
      if (privateConversationId) {
        await sendPrivateMessage.mutateAsync({
          conversationId: privateConversationId,
          ...variables,
        });
      } else {
        await sendMessage.mutateAsync({ groupId: groupId!, ...variables });
      }
      invalidate();
      return true;
    } catch (err: any) {
      toast.error("Failed to send message", {
        description: err?.data?.error || err?.response?.data?.error || "Unknown error",
      });
      return false;
    }
  };

  const clearComposer = () => {
    setText("");
    setAttachments([]);
    setMentionIds([]);
    setMentionAll(false);
    setReplyTo(null);
  };

  const doSend = async (
    payload: {
      body?: string;
      objectPath?: string;
      fileName?: string;
      kind?: "text" | "voice";
    },
    onDone?: () => void,
  ) => {
    if (!(await sendPayload(payload))) return;
    clearComposer();
    onDone?.();
  };

  const handleSend = async () => {
    const body = text.trim();
    const queuedAttachments = attachments;
    if (!body && queuedAttachments.length === 0) return;

    if (queuedAttachments.length === 0) {
      await doSend({ body: body || undefined });
      return;
    }

    setIsSendingBatch(true);
    let bodyPending = Boolean(body);
    let firstMessage = true;
    try {
      for (const file of queuedAttachments) {
        const sent = await sendPayload(
          {
            body: bodyPending ? body : undefined,
            objectPath: file.objectPath,
            fileName: file.fileName,
          },
          firstMessage,
        );
        if (!sent) break;

        setAttachments((current) =>
          current.filter((attachment) => attachment.objectPath !== file.objectPath),
        );
        if (bodyPending) setText("");
        if (firstMessage) {
          setMentionIds([]);
          setMentionAll(false);
          setReplyTo(null);
        }
        bodyPending = false;
        firstMessage = false;
      }
    } finally {
      setIsSendingBatch(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size === 0) return;
        const ext = (recorder.mimeType || "audio/webm").includes("mp4")
          ? "m4a"
          : "webm";
        const file = new File([blob], `voice-note.${ext}`, { type: blob.type });
        const res = await uploadFile(file);
        if (res) {
          doSend({
            objectPath: res.objectPath,
            fileName: "Voice note",
            kind: "voice",
          });
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Microphone unavailable", {
        description: "Allow microphone access to send voice notes.",
      });
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const handleDelete = (m: ChatMessage) => {
    if (!window.confirm("Delete this message?")) return;
    const callbacks = {
        onSuccess: () => invalidate(),
        onError: () => toast.error("Failed to delete message"),
      };
    if (privateConversationId) {
      deletePrivateMessage.mutate(
        { conversationId: privateConversationId, messageId: m.id },
        callbacks,
      );
    } else {
      deleteMessage.mutate({ groupId: groupId!, messageId: m.id }, callbacks);
    }
  };

  const memberOptions = useMemo(() => members || [], [members]);
  const mentionQuery = mentionSearch?.query.trim().toLowerCase() || "";
  const filteredMentionMembers = memberOptions.filter((member) =>
    member.fullName.toLowerCase().includes(mentionQuery),
  );
  const showAllMentionOption =
    !mentionQuery || "all".includes(mentionQuery) || "everyone".includes(mentionQuery);
  const onlineMemberCount = memberOptions.filter((member) => member.isOnline).length;

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 sm:px-4 py-3">
        <p className="font-medium text-sm flex items-center gap-2">
          <MessagesSquare className="h-4 w-4" />
          {groupName}
          <span className="text-xs text-muted-foreground font-normal">
            {privateConversationId
              ? <PresenceStatus isOnline={privateIsOnline} lastSeenAt={privateLastSeenAt} />
              : members
                ? `${onlineMemberCount} online · ${memberOptions.length} ${memberOptions.length === 1 ? "member" : "members"}`
                : "Checking who is online…"}
          </span>
        </p>
      </div>

      {/* Radix ScrollArea renders its content wrapper as display:table, which
          lets long messages expand it sideways and clip the chat on phones.
          Force it back to a normal block that fills the viewport width. */}
      <ScrollArea className="min-h-0 flex-1 px-3 sm:px-4 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="py-4 space-y-3">
          {(messages || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Say hello!
            </p>
          )}
          {(messages || []).map((m, i, arr) => {
            const mine = m.userId === myUserId;
            const prev = arr[i - 1];
            const showDay =
              !prev ||
              new Date(prev.createdAt).toDateString() !==
                new Date(m.createdAt).toDateString();
            return (
              <div key={m.id} className="space-y-3">
                {showDay && <DaySeparator label={dayLabel(m.createdAt)} />}
                <MessageBubble
                  m={m}
                  mine={mine}
                  canDelete={mine || (isManagement && !privateConversationId)}
                  onReply={() => setReplyTo(m)}
                  onDelete={() => handleDelete(m)}
                />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-2.5 sm:p-3 space-y-2">
        {replyTo && (
          <div className="flex items-start gap-2 rounded border-l-2 border-primary bg-muted/60 px-2.5 py-1.5 text-xs">
            <Reply className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{replyTo.userName}</p>
              <p className="truncate text-muted-foreground">
                {replyTo.body || replyTo.fileName || "Attachment"}
              </p>
            </div>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {attachments.map((attachment) => (
              <Badge
                key={attachment.objectPath}
                variant="secondary"
                className="max-w-full gap-1.5"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="max-w-40 truncate">{attachment.fileName}</span>
                <button
                  type="button"
                  disabled={isSendingBatch}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((file) => file.objectPath !== attachment.objectPath),
                    )
                  }
                  aria-label={`Remove ${attachment.fileName}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {isRecording && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            Recording... tap the stop button to send.
          </div>
        )}
        <div className="flex items-end gap-1.5 sm:items-center sm:gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            aria-label="Choose multiple files"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="inline-flex shrink-0"
            disabled={isUploading || isBatchUploading || isSendingBatch || isRecording}
            onClick={() => fileInputRef.current?.click()}
            title="Attach files or photos"
            aria-label="Attach files or photos"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            className="inline-flex shrink-0"
            disabled={
              isUploading ||
              isBatchUploading ||
              isSendingBatch ||
              isRecording ||
              attachments.length > 0 ||
              sendMessage.isPending ||
              sendPrivateMessage.isPending
            }
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? "Stop and send" : "Record a voice note"}
          >
            {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Popover
            open={!privateConversationId && tagOpen}
            onOpenChange={(open) => {
              setTagOpen(open);
              if (!open) setMentionSearch(null);
            }}
          >
            {!privateConversationId && <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden sm:inline-flex shrink-0"
                title="Tag someone"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const input = messageInputRef.current;
                  const start = input?.selectionStart ?? text.length;
                  const end = input?.selectionEnd ?? start;
                  setMentionSearch({ start, end, query: "" });
                }}
              >
                <AtSign className="h-4 w-4" />
              </Button>
            </PopoverTrigger>}
            <PopoverAnchor asChild>
              <Textarea
                ref={messageInputRef}
                rows={1}
                value={text}
                onChange={(e) => {
                  const value = e.target.value;
                  const caret = e.target.selectionStart;
                  setText(value);

                  if (!privateConversationId) {
                    const match = /(?:^|[^\w@])@([^\s@]*)$/.exec(value.slice(0, caret));
                    if (match) {
                      const query = match[1];
                      setMentionSearch({
                        start: caret - query.length - 1,
                        end: caret,
                        query,
                      });
                      setTagOpen(true);
                    } else {
                      setMentionSearch(null);
                      setTagOpen(false);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && tagOpen) {
                    e.preventDefault();
                    setTagOpen(false);
                    setMentionSearch(null);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (tagOpen && mentionSearch) {
                      const firstSuggestion = showAllMentionOption
                        ? "__all__"
                        : filteredMentionMembers[0]
                          ? String(filteredMentionMembers[0].id)
                          : null;
                      if (firstSuggestion) {
                        e.preventDefault();
                        handleTag(firstSuggestion);
                        return;
                      }
                    }
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isSendingBatch}
                placeholder={
                  isUploading || isBatchUploading ? "Uploading files..." : "Type a message..."
                }
                className="flex-1 min-w-0 w-full min-h-11 sm:min-h-9 max-h-44 resize-none overflow-y-hidden rounded-[1.5rem] bg-background px-4 py-2.5 sm:rounded-md sm:px-3 sm:py-2"
              />
            </PopoverAnchor>
            {!privateConversationId && <PopoverContent
              side="top"
              align="start"
              className="w-60 p-1"
              // Keep the list inside the screen and scrollable on phones.
              collisionPadding={8}
            >
              <div className="max-h-[45vh] overflow-y-auto overscroll-contain">
                {showAllMentionOption && (
                  <button
                    type="button"
                    className="w-full rounded px-2.5 py-2 text-left text-sm font-medium hover:bg-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleTag("__all__")}
                  >
                    @ Everyone
                  </button>
                )}
                {filteredMentionMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleTag(String(m.id))}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate">{m.fullName}</span>
                      <PresenceStatus
                        isOnline={m.isOnline}
                        lastSeenAt={m.lastSeenAt}
                      />
                    </span>
                  </button>
                ))}
                {!showAllMentionOption && filteredMentionMembers.length === 0 && (
                  <p className="px-2.5 py-2 text-sm text-muted-foreground">No matching employees</p>
                )}
              </div>
            </PopoverContent>}
          </Popover>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="hidden sm:inline-flex shrink-0"
            onClick={insertLineBreak}
            disabled={isUploading || isBatchUploading || isSendingBatch || isRecording}
            title="New line (Shift + Enter)"
            aria-label="Insert a new line"
          >
            <CornerDownLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full bg-[#25D366] p-0 text-white hover:bg-[#20bd5a] sm:h-10 sm:w-10 sm:rounded-md sm:bg-primary sm:text-primary-foreground sm:hover:bg-primary/90"
            onClick={handleSend}
            disabled={
              sendMessage.isPending ||
              sendPrivateMessage.isPending ||
              isUploading ||
              isBatchUploading ||
              isSendingBatch ||
              isRecording ||
              (!text.trim() && attachments.length === 0)
            }
            title="Send"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
