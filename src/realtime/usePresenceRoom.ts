import type {
  RealtimeChannel,
  SupabaseClient
} from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeConfig } from "./config";
import {
  connectInternetRelay,
  getPeerRoomName,
  type InternetRelay
} from "./peerTransport";
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

const isRoomPeer = (value: unknown): value is RoomPeer => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const peer = value as Partial<RoomPeer>;
  return (
    typeof peer.roomCode === "string" &&
    typeof peer.clientId === "string" &&
    typeof peer.displayName === "string" &&
    (peer.station === "earth" ||
      peer.station === "moon" ||
      peer.station === "spaceStation") &&
    (peer.avatar === "atlas" || peer.avatar === "nova" || peer.avatar === "sol") &&
    (peer.role === "father" || peer.role === "daughter") &&
    typeof peer.joinedAt === "string"
  );
};

const isLocalEnvelope = (value: unknown): value is LocalEnvelope => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as Partial<LocalEnvelope>;
  if (envelope.kind === "presence") {
    return isRoomPeer(envelope.peer);
  }
  if (envelope.kind === "message") {
    return isRoomMessage(envelope.message);
  }
  if (envelope.kind === "hello" || envelope.kind === "leave") {
    return typeof envelope.clientId === "string";
  }
  return (
    envelope.kind === "history" &&
    typeof envelope.recipientId === "string" &&
    Array.isArray(envelope.messages) &&
    envelope.messages.every(isRoomMessage)
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
      let disposed = false;
      let peerRelay: InternetRelay | null = null;
      let heartbeat = 0;
      let pruning = 0;
      let transportStarted = false;
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
      let sendEnvelope = async (_envelope: LocalEnvelope) => false;
      const publishPresence = () => {
        void sendEnvelope({ kind: "presence", peer: localPeer });
      };

      const connectPeerRoom = async () => {
        const relay = await connectInternetRelay({
          topic: getPeerRoomName(roomCode),
          onMessage: (value) => {
            if (!isLocalEnvelope(value)) {
              return;
            }
            const envelope = value;
            if (envelope.kind === "hello") {
              publishPresence();
              if (
                localPeer.role === "father" &&
                messagesRef.current.length > 0
              ) {
                void sendEnvelope({
                  kind: "history",
                  recipientId: envelope.clientId,
                  messages: messagesRef.current
                });
              }
              return;
            }
            if (envelope.kind === "history") {
              if (envelope.recipientId === localPeer.clientId) {
                envelope.messages.forEach(addMessage);
              }
              return;
            }
            if (envelope.kind === "message") {
              addMessage(envelope.message);
              return;
            }
            if (envelope.kind === "leave") {
              knownPeers.delete(envelope.clientId);
              syncPeers();
              return;
            }
            knownPeers.set(envelope.peer.clientId, {
              peer: envelope.peer,
              seenAt: Date.now()
            });
            syncPeers();
          },
          onStatus: (nextStatus) => {
            if (disposed) {
              return;
            }
            setStatus(nextStatus);
            if (nextStatus === "error") {
              setError("The internet room could not connect. Try again.");
              return;
            }
            if (nextStatus === "connected" && !transportStarted) {
              transportStarted = true;
              setError("");
              sendRef.current = async (message) => {
                addMessage(message);
                return sendEnvelope({ kind: "message", message });
              };
              void sendEnvelope({ kind: "hello", clientId: localPeer.clientId });
              publishPresence();
              heartbeat = window.setInterval(publishPresence, 4_000);
              pruning = window.setInterval(syncPeers, 4_000);
            }
          }
        });
        if (disposed) {
          relay.close();
          return;
        }
        peerRelay = relay;
        sendEnvelope = relay.publish;
      };

      void connectPeerRoom().catch(() => {
        if (!disposed) {
          setStatus("error");
          setError("The internet room could not connect. Try again.");
        }
      });

      return () => {
        disposed = true;
        window.clearInterval(heartbeat);
        window.clearInterval(pruning);
        const leave = sendEnvelope({
          kind: "leave",
          clientId: localPeer.clientId
        });
        void leave.finally(() => peerRelay?.close());
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
    transport: realtimeConfig.hosted ? "hosted" : "peer"
  } as const;
}

