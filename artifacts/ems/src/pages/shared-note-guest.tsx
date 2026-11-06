import { useState, type FormEvent } from "react";
import { useSearch } from "wouter";
import {
  useRequestExternalNoteCode,
  useVerifyExternalNoteCode,
} from "@workspace/api-client-react";
import { FileText, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SharedNoteGuestPage() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [sharedNote, setSharedNote] = useState<{
    ownerName: string;
    content: string;
    updatedAt: Date | string;
  } | null>(null);
  const requestCode = useRequestExternalNoteCode();
  const verifyCode = useVerifyExternalNoteCode();

  const handleRequestCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestCode.mutate(
      { data: { token, email } },
      {
        onSuccess: () => {
          setRequestSent(true);
          toast.success("Access request sent.");
        },
        onError: () => toast.error("Could not send the access request. Check the email and try again."),
      },
    );
  };

  const handleVerifyCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    verifyCode.mutate(
      { data: { token, email, code } },
      {
        onSuccess: (result) => {
          setSharedNote(result);
          setCode("");
        },
        onError: () => toast.error("That code is invalid or expired. Request a new code from the note owner."),
      },
    );
  };

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {sharedNote ? (
              <FileText className="h-5 w-5 text-primary" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-primary" />
            )}
            {sharedNote ? "Shared note" : "View a shared note"}
          </CardTitle>
          <CardDescription>
            {sharedNote
              ? `Shared by ${sharedNote.ownerName}. This note is read-only.`
              : "The note owner must approve your request and send you a temporary code."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!token ? (
            <p role="alert" className="text-sm text-destructive">
              This share link is incomplete.
            </p>
          ) : sharedNote ? (
            <article>
              <div className="max-h-[65vh] overflow-y-auto rounded-lg border bg-background p-4">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {sharedNote.content || "Empty note"}
                </p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Last updated {new Date(sharedNote.updatedAt).toLocaleString()}
              </p>
            </article>
          ) : (
            <>
              <form onSubmit={handleRequestCode} className="space-y-3">
                <label htmlFor="guest-email" className="text-sm font-medium">
                  Your email address
                </label>
                <Input
                  id="guest-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <Button type="submit" disabled={requestCode.isPending}>
                  {requestCode.isPending ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  Request access code
                </Button>
                {requestSent && (
                  <p role="status" className="text-sm text-muted-foreground">
                    If the link is active, the note owner has received your request. Ask them to
                    send you the code.
                  </p>
                )}
              </form>

              <form onSubmit={handleVerifyCode} className="space-y-3 border-t pt-4">
                <label htmlFor="guest-code" className="text-sm font-medium">
                  Access code
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="guest-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    minLength={8}
                    maxLength={8}
                    pattern="[0-9]{8}"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="8-digit code"
                    aria-describedby="guest-code-help"
                  />
                  <Button
                    type="submit"
                    disabled={verifyCode.isPending || code.length !== 8 || !email.trim()}
                  >
                    {verifyCode.isPending && (
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Verify code
                  </Button>
                </div>
                <p id="guest-code-help" className="text-xs text-muted-foreground">
                  Use the same email address you entered when requesting the code. Each code works
                  once and expires after 24 hours.
                </p>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
