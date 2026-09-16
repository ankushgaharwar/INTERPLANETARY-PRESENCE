import type {
  RealtimeChannel,
  SupabaseClient
} from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeConfig } from "./config";
import type {
  MediaSignal,
  OutgoingMediaSignal,
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
}

interface LocalSignalEnvelope {
  kind: "signal";
  signal: MediaSignal;
}

type LocalEnvelope =
  | LocalPresenceEnvelope
  | LocalLeaveEnvelope
  | LocalMessageEnvelope
  | LocalSignalEnvelope
  | LocalHelloEnvelope;

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

const isMediaSignal = (value: unknown): value is MediaSignal => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const signal = value as Partial<MediaSignal>;
  return (
    typeof signal.id === "string" &&
    typeof signal.roomCode === "string" &&
    typeof signal.senderId === "string" &&
    (signal.targetId === undefined || typeof signal.targetId === "string") &&
    (signal.kind === "media-ready" ||
      signal.kind === "offer" ||
      signal.kind === "answer" ||
      signal.kind === "candidate") &&
    typeof signal.sentAt === "number"
  );
};

const normalizeRoomCode = (roomCode: string) =>
  roomCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

export function usePresenceRoom(session: RoomSession | null) {
  const [status, setStatus] =
    useState<RoomConnectionStatus>("disconnected");
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [mediaSignals, setMediaSignals] = useState<MediaSignal[]>([]);
  const [error, setError] = useState("");
  const sendRef = useRef<(message: RoomMessage) => Promise<boolean>>(async () =>
    false
  );
  const signalRef = useRef<(signal: MediaSignal) => Promise<boolean>>(
    async () => false
  );

  const addMessage = useCallback((message: RoomMessage) => {
    setMessages((current) => {
      if (current.some((candidate) => candidate.id === message.id)) {
        return current;
      }

      return [...current, message].sort(
        (first, second) => first.sentAt - second.sentAt || first.id.localeCompare(second.id)
      );
    });
  }, []);

  const addMediaSignal = useCallback((signal: MediaSignal) => {
    setMediaSignals((current) => {
      if (current.some((candidate) => candidate.id === signal.id)) {
        return current;
      }
      return [...current.slice(-99), signal];
    });
  }, []);

  useEffect(() => {
    setMessages([]);
    setMediaSignals([]);
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
          return;
        }
        if (envelope.kind === "message" && isRoomMessage(envelope.message)) {
          addMessage(envelope.message);
          return;
        }
        if (envelope.kind === "signal" && isMediaSignal(envelope.signal)) {
          addMediaSignal(envelope.signal);
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
      signalRef.current = async (signal) => {
        channel.postMessage({ kind: "signal", signal } satisfies LocalEnvelope);
        return true;
      };

      setStatus("connected");
      channel.postMessage({ kind: "hello" } satisfies LocalEnvelope);
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
        signalRef.current = async () => false;
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
        .on("broadcast", { event: "media-signal" }, ({ payload }) => {
          if (isMediaSignal(payload)) {
            addMediaSignal(payload);
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
      signalRef.current = async (signal) => {
        const response = await channel.send({
          type: "broadcast",
          event: "media-signal",
          payload: signal
        });
        if (response !== "ok") {
          setError("The media connection could not be negotiated.");
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
      signalRef.current = async () => false;
    };
  }, [addMediaSignal, addMessage, session]);

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

  const sendMediaSignal = useCallback(
    async (outgoing: OutgoingMediaSignal) => {
      if (!session || status !== "connected") {
        return false;
      }

      const signal: MediaSignal = {
        ...outgoing,
        id: crypto.randomUUID(),
        roomCode: normalizeRoomCode(session.roomCode),
        senderId: session.clientId,
        sentAt: Date.now()
      };
      return signalRef.current(signal);
    },
    [session, status]
  );

  return {
    status,
    peers,
    messages,
    mediaSignals,
    error,
    sendMessage,
    sendMediaSignal,
    transport: realtimeConfig.hosted ? "hosted" : "local"
  } as const;
}
