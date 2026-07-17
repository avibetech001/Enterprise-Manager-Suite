import { useEffect, useState } from "react";
import {
  useGetPushPublicKey,
  useSubscribeToPush,
  useUnsubscribeFromPush,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const supported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function PushNotificationsCard() {
  const { data: keyData } = useGetPushPublicKey();
  const subscribe = useSubscribeToPush();
  const unsubscribe = useUnsubscribeFromPush();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => setEnabled(false));
  }, []);

  const handleEnable = async () => {
    if (!keyData?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications blocked", {
          description: "Allow notifications for this site in your browser settings.",
        });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey).buffer as ArrayBuffer,
      });
      const json = sub.toJSON();
      await subscribe.mutateAsync({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
      });
      setEnabled(true);
      toast.success("Notifications enabled on this device");
    } catch (_err) {
      toast.error("Could not enable notifications on this device");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribe.mutateAsync({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Notifications turned off on this device");
    } catch (_err) {
      toast.error("Could not turn off notifications");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Phone & Device Notifications
        </CardTitle>
        <CardDescription>
          Get pop-up notifications on this device, even when the app is closed.
          On iPhone, first add the app to your home screen (Share → Add to Home
          Screen), then open it from there and enable notifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This browser does not support notifications. On iPhone, add the app
            to your home screen and open it from there.
          </p>
        ) : enabled ? (
          <Button variant="outline" onClick={handleDisable} disabled={busy}>
            <BellOff className="h-4 w-4 mr-2" />
            Turn off on this device
          </Button>
        ) : (
          <Button onClick={handleEnable} disabled={busy || !keyData}>
            <Bell className="h-4 w-4 mr-2" />
            Enable notifications on this device
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
