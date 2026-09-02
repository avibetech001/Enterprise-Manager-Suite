import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListChatGroups,
  useListChatMessages,
  useListChatGroupMembers,
  getListChatGroupMembersQueryKey,
  useSendChatMessage,
  useDeleteChatMessage,
  getListChatMessagesQueryKey,
  useListPrivateChatEmployees,
  getListPrivateChatEmployeesQueryKey,
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
} from "lucide-react";

// Render message text with clickable links.
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function TeamChatPage() {
  const { data: session } = useGetCurrentSession();
  const { data: groups } = useListChatGroups();
  const { data: privateConversations } = useListPrivateConversations({
    query: {
      queryKey: getListPrivateConversationsQueryKey(),
      refetchInterval: 4000,
    },
  });
  const isManagement = session?.user?.role !== "employee";
  const { data: privateEmployees } = useListPrivateChatEmployees({
    query: {
      queryKey: getListPrivateChatEmployeesQueryKey(),
      enabled: isManagement,
    },
  });
  const createPrivateConversation = useCreatePrivateConversation();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    // Support deep links from notifications: ...chat?group=dept-3
    return new URLSearchParams(window.location.search).get("group");
  });
  const [activeConversationId, setActiveConversationId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("conversation"));
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

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
                {g.kind === "company" ? (
                  <Users className="h-5 w-5 text-primary" />
                ) : (
                  <Building2 className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.kind === "company" ? "Everyone in the company" : "Department group"}
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
        {isManagement && (
          <Card>
            <CardContent className="flex flex-col gap-2 py-4 sm:flex-row">
              <select
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                aria-label="Choose an active employee"
              >
                <option value="">Choose an active employee</option>
                {(privateEmployees || []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.fullName}</option>
                ))}
              </select>
              <Button
                disabled={!selectedEmployeeId || createPrivateConversation.isPending}
                onClick={() => createPrivateConversation.mutate(
                  { data: { employeeId: Number(selectedEmployeeId) } },
                  {
                    onSuccess: (conversation) => {
                      queryClient.invalidateQueries({
                        queryKey: getListPrivateConversationsQueryKey(),
                      });
                      setActiveConversationId(conversation.id);
                      setSelectedEmployeeId("");
                    },
                    onError: () => toast.error("Could not start private conversation"),
                  },
                )}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Start conversation
              </Button>
            </CardContent>
          </Card>
        )}
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
                  <span className="font-medium">{conversation.otherUserName}</span>
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
        {fileUrl && m.kind === "voice" ? (
          <audio controls preload="none" src={fileUrl} className="mt-1 max-w-full h-9" />
        ) : (
          fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className={`mt-1 flex items-center gap-1.5 text-xs underline break-all ${
                mine ? "text-primary-foreground" : "text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              {m.fileName || "Attachment"}
            </a>
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
}: {
  groupId?: string;
  privateConversationId?: number;
  groupName: string;
  myUserId?: number;
  isManagement: boolean;
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
    },
  });
  const sendMessage = useSendChatMessage();
  const sendPrivateMessage = useSendPrivateMessage();
  const deleteMessage = useDeleteChatMessage();
  const deletePrivateMessage = useDeletePrivateMessage();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{
    objectPath: string;
    fileName: string;
  } | null>(null);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [mentionAll, setMentionAll] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
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
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    if (res) setAttachment({ objectPath: res.objectPath, fileName: file.name });
    e.target.value = "";
  };

  const handleTag = (userIdStr: string) => {
    if (userIdStr === "__all__") {
      setMentionAll(true);
      setText((t) => (t ? `${t.replace(/\s$/, "")} @all ` : "@all "));
      return;
    }
    const userId = Number(userIdStr);
    const member = members?.find((m) => m.id === userId);
    if (!member) return;
    if (!mentionIds.includes(userId)) setMentionIds((ids) => [...ids, userId]);
    setText((t) => (t ? `${t.replace(/\s$/, "")} @${member.fullName} ` : `@${member.fullName} `));
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

  const doSend = (
    payload: {
      body?: string;
      objectPath?: string;
      fileName?: string;
      kind?: "text" | "voice";
    },
    onDone?: () => void,
  ) => {
    const variables = {
      data: {
          ...payload,
          mentionUserIds: privateConversationId ? undefined : (mentionIds.length ? mentionIds : undefined),
          mentionAll: privateConversationId ? undefined : (mentionAll || undefined),
          replyToId: replyTo?.id,
      },
    };
    const callbacks = {
        onSuccess: () => {
          setText("");
          setAttachment(null);
          setMentionIds([]);
          setMentionAll(false);
          setReplyTo(null);
          invalidate();
          onDone?.();
        },
        onError: (err: any) => {
          toast.error("Failed to send message", {
            description: err?.data?.error || "Unknown error",
          });
        },
      };
    if (privateConversationId) {
      sendPrivateMessage.mutate(
        { conversationId: privateConversationId, ...variables },
        callbacks,
      );
    } else {
      sendMessage.mutate({ groupId: groupId!, ...variables }, callbacks);
    }
  };

  const handleSend = () => {
    const body = text.trim();
    if (!body && !attachment) return;
    doSend({
      body: body || undefined,
      objectPath: attachment?.objectPath,
      fileName: attachment?.fileName,
    });
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

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 sm:px-4 py-3">
        <p className="font-medium text-sm flex items-center gap-2">
          <MessagesSquare className="h-4 w-4" />
          {groupName}
          <span className="text-xs text-muted-foreground font-normal">
            {privateConversationId
              ? "Private conversation"
              : `${memberOptions.length} ${memberOptions.length === 1 ? "member" : "members"}`}
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
        {attachment && (
          <Badge variant="secondary" className="gap-1.5 max-w-full">
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">{attachment.fileName}</span>
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {isRecording && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            Recording... tap the stop button to send.
          </div>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={isUploading || isRecording}
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            className="shrink-0"
            disabled={isUploading || sendMessage.isPending}
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? "Stop and send" : "Record a voice note"}
          >
            {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          {!privateConversationId && <Popover open={tagOpen} onOpenChange={setTagOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Tag someone"
              >
                <AtSign className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-60 p-1"
              // Keep the list inside the screen and scrollable on phones.
              collisionPadding={8}
            >
              <div className="max-h-[45vh] overflow-y-auto overscroll-contain">
                <button
                  type="button"
                  className="w-full rounded px-2.5 py-2 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => {
                    handleTag("__all__");
                    setTagOpen(false);
                  }}
                >
                  @ Everyone
                </button>
                {memberOptions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      handleTag(String(m.id));
                      setTagOpen(false);
                    }}
                  >
                    {m.fullName}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>}
          <Textarea
            ref={messageInputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isUploading ? "Uploading file..." : "Type a message..."}
            className="flex-1 min-w-0 min-h-9 max-h-28 resize-none py-2"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            onClick={insertLineBreak}
            disabled={isUploading || isRecording}
            title="New line (Shift + Enter)"
            aria-label="Insert a new line"
          >
            <CornerDownLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="shrink-0"
            onClick={handleSend}
            disabled={sendMessage.isPending || sendPrivateMessage.isPending || isUploading || isRecording || (!text.trim() && !attachment)}
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
