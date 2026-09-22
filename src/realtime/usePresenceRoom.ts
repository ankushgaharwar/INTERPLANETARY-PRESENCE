import type {
  RealtimeChannel,
  SupabaseClient
} from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeConfig } from "./config";
import type {
  RoomConnectionStatus,
  RoomMessage,
  RoomPeer,
  RoomSession
} from "./types";

interface LocalPresenceEnvelope {
  kind: "presence";
  peer: RoomPeer;
}

interface LocalLeaveEnvelope {
  kind: "leave";
  clientId: string;
}

interface LocalMessageEnvelope {
  kind: "message";
  message: RoomMessage;
}

interface LocalHelloEnvelope {
  kind: "hello";
  clientId: string;
}

interface LocalHistoryEnvelope {
  kind: "history";
  recipientId: string;
  messages: RoomMessage[];
}

type LocalEnvelope =
  | LocalPresenceEnvelope
  | LocalLeaveEnvelope
  | LocalMessageEnvelope
  | LocalHelloEnvelope
  | LocalHistoryEnvelope;

const isRoomMessage = (value: unknown): value is RoomMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<RoomMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.roomCode === "string" &&
    typeof message.senderId === "string" &&
    typeof message.senderName === "string" &&
    (message.senderRole === "father" || message.senderRole === "daughter") &&
    (message.senderStation === "earth" ||
      message.senderStation === "moon" ||
      message.senderStation === "spaceStation") &&
    typeof message.text === "string" &&
    typeof message.sentAt === "number"
  );
};

const normalizeRoomCode = (roomCode: string) =>
  roomCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

export function usePresenceRoom(session: RoomSession | null) {
  const [status, setStatus] =
    useState<RoomConnectionStatus>("disconnected");
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const messagesRef = useRef<RoomMessage[]>([]);
  const [error, setError] = useState("");
  const sendRef = useRef<(message: RoomMessage) => Promise<boolean>>(async () =>
    false
  );

  const addMessage = useCallback((message: RoomMessage) => {
    setMessages((current) => {
      if (current.some((candidate) => candidate.id === message.id)) {
        return current;
      }

      const next = [...current, message].sort(
        (first, second) => first.sentAt - second.sentAt || first.id.localeCompare(second.id)
      );
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    setMessages([]);
    messagesRef.current = [];
    setError("");
    if (!session) {
      setStatus("disconnected");
      setPeers([]);
      return;
    }

    const roomCode = normalizeRoomCode(session.roomCode);
    const localPeer: RoomPeer = {
      ...session,
      roomCode,
      joinedAt: new Date().toISOString()
    };
    setStatus("connecting");
    setPeers([localPeer]);

    if (!realtimeConfig.hosted) {
      if (!("BroadcastChannel" in window)) {
        setStatus("error");
        setError("This browser cannot open a local shared room.");
        return;
      }

      const channel = new BroadcastChannel(`presence-room-${roomCode}`);
      const knownPeers = new Map<string, { peer: RoomPeer; seenAt: number }>();
      knownPeers.set(localPeer.clientId, { peer: localPeer, seenAt: Date.now() });

      const syncPeers = () => {
        const expiry = Date.now() - 12_000;
        knownPeers.forEach((value, key) => {
          if (key !== localPeer.clientId && value.seenAt < expiry) {
            knownPeers.delete(key);
          }
        });
        setPeers([...knownPeers.values()].map(({ peer }) => peer));
      };
      const publishPresence = () => {
        channel.postMessage({ kind: "presence", peer: localPeer } satisfies LocalEnvelope);
      };

      channel.onmessage = (event: MessageEvent<LocalEnvelope>) => {
        const envelope = event.data;
        if (envelope.kind === "hello") {
          publishPresence();
          if (localPeer.role === "father" && messagesRef.current.length > 0) {
            channel.postMessage({
              kind: "history",
              recipientId: envelope.clientId,
              messages: messagesRef.current
            } satisfies LocalEnvelope);
          }
          return;
        }
        if (envelope.kind === "history") {
          if (envelope.recipientId === localPeer.clientId) {
            envelope.messages.filter(isRoomMessage).forEach(addMessage);
          }
          return;
        }
        if (envelope.kind === "message" && isRoomMessage(envelope.message)) {
          addMessage(envelope.message);
          return;
        }
        if (envelope.kind === "leave") {
          knownPeers.delete(envelope.clientId);
          syncPeers();
          return;
        }
        if (envelope.kind === "presence") {
          knownPeers.set(envelope.peer.clientId, {
            peer: envelope.peer,
            seenAt: Date.now()
          });
          syncPeers();
        }
      };

      sendRef.current = async (message) => {
        addMessage(message);
        channel.postMessage({ kind: "message", message } satisfies LocalEnvelope);
        return true;
      };

      setStatus("connected");
      channel.postMessage({
        kind: "hello",
        clientId: localPeer.clientId
      } satisfies LocalEnvelope);
      publishPresence();
      const heartbeat = window.setInterval(publishPresence, 4_000);
      const pruning = window.setInterval(syncPeers, 4_000);

      return () => {
        window.clearInterval(heartbeat);
        window.clearInterval(pruning);
        channel.postMessage({
          kind: "leave",
          clientId: localPeer.clientId
        } satisfies LocalEnvelope);
        channel.close();
        sendRef.current = async () => false;
      };
    }

    let disposed = false;
    let supabase: SupabaseClient | null = null;
    let realtimeChannel: RealtimeChannel | null = null;

    const connectHostedRoom = async () => {
      const { createClient } = await import("@supabase/supabase-js");
      if (disposed) {
        return;
      }

      supabase = createClient(
        realtimeConfig.supabaseUrl,
        realtimeConfig.supabasePublishableKey,
        {
          auth: { persistSession: false, autoRefreshToken: false }
        }
      );
      const channel = supabase.channel(`room:${roomCode}`, {
        config: {
          broadcast: { self: true, ack: true },
          presence: { key: localPeer.clientId }
        }
      });
      realtimeChannel = channel;

      const syncHostedPeers = () => {
        const presenceState = channel.presenceState<RoomPeer>();
        const connected = Object.values(presenceState).flat();
        setPeers(
          connected.length > 0
            ? connected.map((peer) => ({ ...peer, roomCode }))
            : [localPeer]
        );
      };

      channel
        .on("presence", { event: "sync" }, syncHostedPeers)
        .on("broadcast", { event: "presence-message" }, ({ payload }) => {
          if (isRoomMessage(payload)) {
            addMessage(payload);
          }
        })
        .on(
          "broadcast",
          { event: "presence-history-request" },
          ({ payload }) => {
            const requesterId =
              payload && typeof payload.requesterId === "string"
                ? payload.requesterId
                : "";
            if (
              localPeer.role === "father" &&
              requesterId &&
              requesterId !== localPeer.clientId &&
              messagesRef.current.length > 0
            ) {
              void channel.send({
                type: "broadcast",
                event: "presence-history",
                payload: {
                  recipientId: requesterId,
                  messages: messagesRef.current
                }
              });
            }
          }
        )
        .on("broadcast", { event: "presence-history" }, ({ payload }) => {
          if (
            payload?.recipientId === localPeer.clientId &&
            Array.isArray(payload.messages)
          ) {
            payload.messages.filter(isRoomMessage).forEach(addMessage);
          }
        })
        .subscribe(async (channelStatus) => {
          if (disposed) {
            return;
          }
          if (channelStatus === "SUBSCRIBED") {
            const trackStatus = await channel.track(localPeer);
            if (trackStatus === "ok") {
              setStatus("connected");
              setError("");
              void channel.send({
                type: "broadcast",
                event: "presence-history-request",
                payload: { requesterId: localPeer.clientId }
              });
            } else {
              setStatus("error");
              setError("The room connected, but presence could not be published.");
            }
            return;
          }

          if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT" ||
            channelStatus === "CLOSED"
          ) {
            setStatus("error");
            setError("The realtime room disconnected. Try joining again.");
          }
        });

      sendRef.current = async (message) => {
        const response = await channel.send({
          type: "broadcast",
          event: "presence-message",
          payload: message
        });
        if (response !== "ok") {
          setError("The message could not be transmitted.");
          return false;
        }
        return true;
      };
    };

    void connectHostedRoom().catch(() => {
      if (!disposed) {
        setStatus("error");
        setError("The realtime service could not be loaded.");
      }
    });

    return () => {
      disposed = true;
      if (realtimeChannel && supabase) {
        void realtimeChannel.untrack();
        void supabase.removeChannel(realtimeChannel);
      }
      sendRef.current = async () => false;
    };
  }, [addMessage, session]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!session || status !== "connected") {
        return false;
      }

      const message: RoomMessage = {
        id: crypto.randomUUID(),
        roomCode: normalizeRoomCode(session.roomCode),
        senderId: session.clientId,
        senderName: session.displayName,
        senderRole: session.role,
        senderStation: session.station,
        text,
        sentAt: Date.now()
      };
      return sendRef.current(message);
    },
    [session, status]
  );

  return {
    status,
    peers,
    messages,
    error,
    sendMessage,
    transport: realtimeConfig.hosted ? "hosted" : "local"
  } as const;
}
