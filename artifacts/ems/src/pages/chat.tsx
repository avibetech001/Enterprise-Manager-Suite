import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListChatGroups,
  useListChatMessages,
  useListChatGroupMembers,
  useSendChatMessage,
  getListChatMessagesQueryKey,
  useGetCurrentSession,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessagesSquare,
  Paperclip,
  Send,
  X,
  AtSign,
  Building2,
  Users,
  FileText,
} from "lucide-react";

export default function TeamChatPage() {
  const { data: session } = useGetCurrentSession();
  const { data: groups } = useListChatGroups();
  const [activeGroupId, setActiveGroupId] = useState<string>("company");

  const activeGroup = groups?.find((g) => g.id === activeGroupId) || groups?.[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team Chat</h1>
        <p className="text-muted-foreground mt-1">
          Message your company and department groups, share files, and tag people.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {(groups || []).map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGroupId(g.id)}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                activeGroup?.id === g.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {g.kind === "company" ? (
                <Users className="h-4 w-4 shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{g.name}</span>
            </button>
          ))}
        </div>

        {activeGroup ? (
          <GroupChat
            key={activeGroup.id}
            groupId={activeGroup.id}
            groupName={activeGroup.name}
            myUserId={session?.user?.id}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessagesSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No chat groups yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function GroupChat({
  groupId,
  groupName,
  myUserId,
}: {
  groupId: string;
  groupName: string;
  myUserId?: number;
}) {
  const queryClient = useQueryClient();
  const { data: messages } = useListChatMessages(groupId, {
    query: {
      queryKey: getListChatMessagesQueryKey(groupId),
      refetchInterval: 4000,
    },
  });
  const { data: members } = useListChatGroupMembers(groupId);
  const sendMessage = useSendChatMessage();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{
    objectPath: string;
    fileName: string;
  } | null>(null);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (err) => toast.error("Upload failed", { description: err.message }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    if (res) setAttachment({ objectPath: res.objectPath, fileName: file.name });
    e.target.value = "";
  };

  const handleTag = (userIdStr: string) => {
    const userId = Number(userIdStr);
    const member = members?.find((m) => m.id === userId);
    if (!member) return;
    if (!mentionIds.includes(userId)) setMentionIds((ids) => [...ids, userId]);
    setText((t) => (t ? `${t.replace(/\s$/, "")} @${member.fullName} ` : `@${member.fullName} `));
  };

  const handleSend = () => {
    const body = text.trim();
    if (!body && !attachment) return;
    sendMessage.mutate(
      {
        groupId,
        data: {
          body: body || undefined,
          objectPath: attachment?.objectPath,
          fileName: attachment?.fileName,
          mentionUserIds: mentionIds.length ? mentionIds : undefined,
        },
      },
      {
        onSuccess: () => {
          setText("");
          setAttachment(null);
          setMentionIds([]);
          queryClient.invalidateQueries({
            queryKey: getListChatMessagesQueryKey(groupId),
          });
        },
        onError: (err: any) => {
          toast.error("Failed to send message", {
            description: err?.data?.error || "Unknown error",
          });
        },
      },
    );
  };

  return (
    <Card className="flex flex-col h-[70vh]">
      <div className="border-b px-4 py-3">
        <p className="font-medium text-sm flex items-center gap-2">
          <MessagesSquare className="h-4 w-4" />
          {groupName}
          <span className="text-xs text-muted-foreground font-normal">
            {members?.length || 0} {(members?.length || 0) === 1 ? "member" : "members"}
          </span>
        </p>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="py-4 space-y-3">
          {(messages || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Say hello!
            </p>
          )}
          {(messages || []).map((m) => {
            const mine = m.userId === myUserId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    mine ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {!mine && (
                    <p className="text-xs font-medium mb-0.5 opacity-80">{m.userName}</p>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.filePath && (
                    <a
                      href={`${import.meta.env.BASE_URL}api/storage${m.filePath}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-1 flex items-center gap-1.5 text-xs underline break-all ${
                        mine ? "text-primary-foreground" : "text-foreground"
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {m.fileName || "Attachment"}
                    </a>
                  )}
                  <p className={`text-[10px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}>
                    {new Date(m.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-3 space-y-2">
        {attachment && (
          <Badge variant="secondary" className="gap-1.5 max-w-full">
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">{attachment.fileName}</span>
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        <div className="flex items-center gap-2">
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
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Select value="" onValueChange={handleTag}>
            <SelectTrigger className="w-10 px-0 justify-center shrink-0 [&>svg:last-child]:hidden" title="Tag someone">
              <AtSign className="h-4 w-4" />
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
              {(members || []).map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isUploading ? "Uploading file..." : "Type a message..."}
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0"
            onClick={handleSend}
            disabled={sendMessage.isPending || isUploading || (!text.trim() && !attachment)}
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
