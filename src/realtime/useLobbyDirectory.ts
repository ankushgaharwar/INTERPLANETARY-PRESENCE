import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { realtimeConfig } from "./config";
import type { OpenLobby, RoomConnectionStatus, RoomSession } from "./types";

const DIRECTORY_NAME = "interplanetary-presence-lobbies";
const HEARTBEAT_MILLISECONDS = 3_000;
const LOBBY_EXPIRY_MILLISECONDS = 10_000;

type DirectoryEnvelope =
  | { kind: "hello" }
  | { kind: "lobby-open"; lobby: OpenLobby }
  | { kind: "lobby-close"; roomCode: string; hostClientId: string };

const isOpenLobby = (value: unknown): value is OpenLobby => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const lobby = value as Partial<OpenLobby>;
  return (
    typeof lobby.roomCode === "string" &&
    typeof lobby.hostClientId === "string" &&
    typeof lobby.hostName === "string" &&
    (lobby.hostStation === "earth" ||
      lobby.hostStation === "moon" ||
      lobby.hostStation === "spaceStation") &&
    (lobby.hostAvatar === "atlas" ||
      lobby.hostAvatar === "nova" ||
      lobby.hostAvatar === "sol") &&
    typeof lobby.advertisedAt === "number"
  );
};

const isDirectoryEnvelope = (value: unknown): value is DirectoryEnvelope => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as Partial<DirectoryEnvelope>;
  if (envelope.kind === "hello") {
    return true;
  }
  if (envelope.kind === "lobby-open") {
    return isOpenLobby(envelope.lobby);
  }
  return (
    envelope.kind === "lobby-close" &&
    typeof envelope.roomCode === "string" &&
    typeof envelope.hostClientId === "string"
  );
};

export function useLobbyDirectory(advertisedSession: RoomSession | null) {
  const [lobbies, setLobbies] = useState<OpenLobby[]>([]);
  const [status, setStatus] =
    useState<RoomConnectionStatus>("connecting");

  useEffect(() => {
    let disposed = false;
    let localChannel: BroadcastChannel | null = null;
    let supabase: SupabaseClient | null = null;
    let realtimeChannel: RealtimeChannel | null = null;
    let publishTimer = 0;
    let pruneTimer = 0;
    const knownLobbies = new Map<string, OpenLobby>();

    const hostLobby =
      advertisedSession?.role === "father"
        ? {
            roomCode: advertisedSession.roomCode,
            hostClientId: advertisedSession.clientId,
            hostName: advertisedSession.displayName,
            hostStation: advertisedSession.station,
            hostAvatar: advertisedSession.avatar,
            advertisedAt: Date.now()
          }
        : null;

    const syncLobbies = () => {
      const expiry = Date.now() - LOBBY_EXPIRY_MILLISECONDS;
      knownLobbies.forEach((lobby, roomCode) => {
        if (lobby.advertisedAt < expiry) {
          knownLobbies.delete(roomCode);
        }
      });
      setLobbies(
        [...knownLobbies.values()].sort(
          (first, second) => second.advertisedAt - first.advertisedAt
        )
      );
    };

    const receive = (value: unknown) => {
      if (!isDirectoryEnvelope(value)) {
        return;
      }
      if (value.kind === "lobby-open") {
        knownLobbies.set(value.lobby.roomCode, value.lobby);
        syncLobbies();
      } else if (value.kind === "lobby-close") {
        const current = knownLobbies.get(value.roomCode);
        if (current?.hostClientId === value.hostClientId) {
          knownLobbies.delete(value.roomCode);
          syncLobbies();
        }
      }
    };

    let send = async (_envelope: DirectoryEnvelope) => false;
    const publishLobby = () => {
      if (!hostLobby) {
        return;
      }
      void send({
        kind: "lobby-open",
        lobby: { ...hostLobby, advertisedAt: Date.now() }
      });
    };

    const startTimers = () => {
      publishLobby();
      publishTimer = window.setInterval(publishLobby, HEARTBEAT_MILLISECONDS);
      pruneTimer = window.setInterval(syncLobbies, HEARTBEAT_MILLISECONDS);
    };

    const connectLocalDirectory = () => {
      if (!("BroadcastChannel" in window)) {
        setStatus("error");
        return;
      }

      localChannel = new BroadcastChannel(DIRECTORY_NAME);
      send = async (envelope) => {
        localChannel?.postMessage(envelope);
        return true;
      };
      localChannel.onmessage = (event: MessageEvent<DirectoryEnvelope>) => {
        if (event.data.kind === "hello") {
          publishLobby();
        } else {
          receive(event.data);
        }
      };
      setStatus("connected");
      startTimers();
      void send({ kind: "hello" });
    };

    const connectHostedDirectory = async () => {
      const { createClient } = await import("@supabase/supabase-js");
      if (disposed) {
        return;
      }

      supabase = createClient(
        realtimeConfig.supabaseUrl,
        realtimeConfig.supabasePublishableKey,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const channel = supabase.channel(DIRECTORY_NAME, {
        config: { broadcast: { self: true, ack: true } }
      });
      realtimeChannel = channel;
      send = async (envelope) =>
        (await channel.send({
          type: "broadcast",
          event: "directory",
          payload: envelope
        })) === "ok";

      channel
        .on("broadcast", { event: "directory" }, ({ payload }) => {
          if (isDirectoryEnvelope(payload) && payload.kind === "hello") {
            publishLobby();
          } else {
            receive(payload);
          }
        })
        .subscribe((channelStatus) => {
          if (disposed) {
            return;
          }
          if (channelStatus === "SUBSCRIBED") {
            setStatus("connected");
            startTimers();
            void send({ kind: "hello" });
          } else if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT" ||
            channelStatus === "CLOSED"
          ) {
            setStatus("error");
          }
        });
    };

    if (realtimeConfig.hosted) {
      void connectHostedDirectory();
    } else {
      connectLocalDirectory();
    }

    return () => {
      disposed = true;
      window.clearInterval(publishTimer);
      window.clearInterval(pruneTimer);
      const closeLobby = hostLobby
        ? send({
            kind: "lobby-close",
            roomCode: hostLobby.roomCode,
            hostClientId: hostLobby.hostClientId
          })
        : Promise.resolve(true);
      localChannel?.close();
      if (realtimeChannel && supabase) {
        const channel = realtimeChannel;
        const client = supabase;
        void closeLobby.finally(() => client.removeChannel(channel));
      }
    };
  }, [
    advertisedSession?.clientId,
    advertisedSession?.displayName,
    advertisedSession?.avatar,
    advertisedSession?.role,
    advertisedSession?.roomCode,
    advertisedSession?.station
  ]);

  return { lobbies, status } as const;
}
