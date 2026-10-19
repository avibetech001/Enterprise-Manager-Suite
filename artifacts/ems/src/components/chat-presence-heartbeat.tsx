import { useEffect } from "react";
import { useHeartbeatChatPresence } from "@workspace/api-client-react";

export function ChatPresenceHeartbeat() {
  const { mutate } = useHeartbeatChatPresence();

  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState === "visible") mutate(undefined);
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    window.addEventListener("focus", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", heartbeat);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [mutate]);

  return null;
}
