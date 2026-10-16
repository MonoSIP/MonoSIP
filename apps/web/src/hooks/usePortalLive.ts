import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useStore } from "../store";

/** Portal WebSocket: voicemail.new, missed.new, presence.update */
export function usePortalLive() {
  const qc = useQueryClient();
  const actor = useStore((s) => s.actor);

  useEffect(() => {
    if (actor?.type !== "extension") return;
    const myNum = actor.number;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string; payload?: unknown };
          if (msg.type === "voicemail.new") {
            toast.message("New voicemail");
            void qc.invalidateQueries({ queryKey: ["voicemails"] });
          } else if (msg.type === "missed.new") {
            toast.message("Missed call");
            void qc.invalidateQueries({ queryKey: ["my-missed"] });
            void qc.invalidateQueries({ queryKey: ["my-calls"] });
          } else if (msg.type === "presence.update" || msg.type === "extension.state") {
            const p = msg.payload as { number?: string; state?: string };
            if (p?.number === myNum) {
              void qc.invalidateQueries({ queryKey: ["me"] });
            }
            void qc.invalidateQueries({ queryKey: ["directory"] });
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [actor, qc]);
}
