import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { realtimeConfig } from "./config";
import { connectInternetRelay, getLobbyTopic, PEER_DIRECTORY_ROOM,
  type InternetRelay, type RelayMessageContext } from "./peerTransport";
import type { OpenLobby, RoomConnectionStatus, RoomSession } from "./types";

const HEARTBEAT_MS = 20_000;
const EXPIRY_MS = 180_000;

const isOpenLobby = (value: unknown): value is OpenLobby => {
  if (!value || typeof value !== "object") return false;
  const lobby = value as Partial<OpenLobby>;
  return typeof lobby.roomCode === "string" && /^[A-Z0-9]{6,12}$/.test(lobby.roomCode) &&
    typeof lobby.hostClientId === "string" && typeof lobby.hostName === "string" &&
    lobby.hostName.length <= 32 &&
    ["earth", "moon", "spaceStation"].includes(lobby.hostStation ?? "") &&
    ["atlas", "nova", "sol"].includes(lobby.hostAvatar ?? "") &&
    typeof lobby.advertisedAt === "number" && Number.isFinite(lobby.advertisedAt);
};

export function useLobbyDirectory(advertisedSession: RoomSession | null) {
  const [lobbies, setLobbies] = useState<OpenLobby[]>([]);
  const [status, setStatus] = useState<RoomConnectionStatus>("connecting");
  const [published, setPublished] = useState(false);
  const [publicationError, setPublicationError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let relay: InternetRelay | null = null;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let publish = async () => false;
    const known = new Map<string, { lobby: OpenLobby; seenAt: number }>();
    const hostLobby: OpenLobby | null = advertisedSession?.role === "father" ? {
      roomCode: advertisedSession.roomCode,
      hostClientId: advertisedSession.clientId,
      hostName: advertisedSession.displayName,
      hostStation: advertisedSession.station,
      hostAvatar: advertisedSession.avatar,
      advertisedAt: Date.now()
    } : null;
    setStatus("connecting");
    setPublished(false);
    setPublicationError(false);
    setLobbies([]);

    const sync = () => {
      if (disposed) return;
      const unique = new Map<string, OpenLobby>();
      known.forEach(({ lobby, seenAt }, key) => {
        // Use receipt time: another person's clock must not expire their lobby.
        if (Date.now() - seenAt > EXPIRY_MS) known.delete(key);
        else unique.set(lobby.roomCode, lobby);
      });
      setLobbies([...unique.values()].sort((a, b) => a.hostName.localeCompare(b.hostName)));
    };

    const announce = async () => {
      if (disposed || !hostLobby) return;
      const success = await publish();
      if (disposed) return;
      setPublished(success);
      setPublicationError(!success);
      if (success) {
        known.set("self", { lobby: hostLobby, seenAt: Date.now() });
        sync();
      }
    };

    const receive = (value: unknown, context: RelayMessageContext) => {
      if (disposed) return;
      const key = `${context.source}:${context.topic}`;
      if (value === null) known.delete(key);
      else if (typeof value === "object" && value && "kind" in value &&
        value.kind === "lobby-open" && "lobby" in value && isOpenLobby(value.lobby) &&
        getLobbyTopic(value.lobby.roomCode) === context.topic) {
        known.set(key, { lobby: value.lobby, seenAt: Date.now() });
      }
      sync();
    };

    const connect = async () => {
      if (!realtimeConfig.hosted) {
        const connection = await connectInternetRelay({
          topic: PEER_DIRECTORY_ROOM,
          ...(hostLobby ? { will: { topic: getLobbyTopic(hostLobby.roomCode),
            payload: null, retain: true } } : {}),
          onMessage: receive,
          onStatus: (next) => {
            if (disposed) return;
            setStatus(next);
            if (next !== "connected") setPublished(false);
          },
          onReady: (connectedRelay) => {
            if (disposed) return;
            publish = () => hostLobby ? connectedRelay.publish({ kind: "lobby-open",
              lobby: { ...hostLobby, advertisedAt: Date.now() }
            }, { topic: getLobbyTopic(hostLobby.roomCode), retain: true }) : Promise.resolve(false);
            void announce();
          }
        });
        if (disposed) connection.close();
        else relay = connection;
        return;
      }

      const { createClient } = await import("@supabase/supabase-js");
      if (disposed) return;
      supabase = createClient(realtimeConfig.supabaseUrl, realtimeConfig.supabasePublishableKey,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const hostedChannel = supabase.channel("interplanetary-presence-lobbies-v3", {
        config: { presence: { key: hostLobby?.hostClientId ?? crypto.randomUUID() } }
      });
      channel = hostedChannel;
      publish = async () => hostLobby ? (await hostedChannel.track({
        ...hostLobby, advertisedAt: Date.now()
      })) === "ok" : false;
      hostedChannel.on("presence", { event: "sync" }, () => {
        if (disposed) return;
        known.clear();
        Object.values(hostedChannel.presenceState<OpenLobby>()).flat()
          .filter(isOpenLobby).forEach((lobby) => known.set(lobby.roomCode,
            { lobby, seenAt: Date.now() }));
        sync();
      }).subscribe((next) => {
        if (disposed) return;
        if (next === "SUBSCRIBED") {
          setStatus("connected");
          void announce();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) {
          setStatus("error");
          setPublished(false);
        }
      });
    };

    void connect().catch(() => { if (!disposed) setStatus("error"); });
    const publishTimer = window.setInterval(() => void announce(), HEARTBEAT_MS);
    const pruneTimer = window.setInterval(sync, HEARTBEAT_MS);
    const resume = () => { if (document.visibilityState === "visible") void announce(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", refresh);
    return () => {
      disposed = true;
      clearInterval(publishTimer);
      clearInterval(pruneTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", refresh);
      if (relay) {
        const current = relay;
        // A graceful disconnect suppresses the broker will; explicitly clear
        // the listing on Leave or when the room fills.
        if (hostLobby) void current.publish(null, {
          topic: getLobbyTopic(hostLobby.roomCode), retain: true
        }).finally(() => current.close());
        else current.close();
      }
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [advertisedSession?.clientId, advertisedSession?.displayName,
    advertisedSession?.avatar, advertisedSession?.role, advertisedSession?.roomCode,
    advertisedSession?.station, revision, refresh]);

  return { lobbies, status, published, publicationError, refresh } as const;
}
