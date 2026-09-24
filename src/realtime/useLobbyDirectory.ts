import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { JsonValue, Room } from "@trystero-p2p/mqtt";
import { realtimeConfig } from "./config";
import { PEER_APP_CONFIG, PEER_DIRECTORY_ROOM } from "./peerTransport";
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
    let peerRoom: Room | null = null;
    let supabase: SupabaseClient | null = null;
    let realtimeChannel: RealtimeChannel | null = null;
    let publishTimer = 0;
    let pruneTimer = 0;
    let readinessTimer = 0;
    let readinessTimeout = 0;
    let timersStarted = false;
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

    let send = async (_envelope: DirectoryEnvelope, _target?: string) => false;
    const publishLobby = (target?: string) => {
      if (!hostLobby) {
        return;
      }
      void send(
        {
          kind: "lobby-open",
          lobby: { ...hostLobby, advertisedAt: Date.now() }
        },
        target
      );
    };

    const startTimers = () => {
      if (timersStarted) {
        return;
      }
      timersStarted = true;
      publishLobby();
      publishTimer = window.setInterval(publishLobby, HEARTBEAT_MILLISECONDS);
      pruneTimer = window.setInterval(syncLobbies, HEARTBEAT_MILLISECONDS);
    };

    const connectPeerDirectory = async () => {
      const { getRelaySockets, joinRoom } = await import("@trystero-p2p/mqtt");
      if (disposed) {
        return;
      }

      peerRoom = joinRoom(PEER_APP_CONFIG, PEER_DIRECTORY_ROOM, {
        onJoinError: () => {
          if (!disposed) {
            setStatus("error");
          }
        }
      });
      const directoryAction = peerRoom.makeAction("lobby-directory");
      send = async (envelope, target) => {
        try {
          await directoryAction.send(envelope as unknown as JsonValue, { target });
          return true;
        } catch {
          return false;
        }
      };
      directoryAction.onMessage = (envelope, { peerId }) => {
        if (!isDirectoryEnvelope(envelope)) {
          return;
        }
        if (envelope.kind === "hello") {
          publishLobby(peerId);
        } else {
          receive(envelope);
        }
      };
      peerRoom.onPeerJoin = (peerId) => {
        setStatus("connected");
        startTimers();
        void send({ kind: "hello" }, peerId);
        publishLobby(peerId);
      };

      const updateReadiness = () => {
        const hasOpenRelay = Object.values(
          getRelaySockets() as Record<string, WebSocket>
        ).some(
          (socket) => socket.readyState === 1
        );
        if (hasOpenRelay) {
          window.clearInterval(readinessTimer);
          window.clearTimeout(readinessTimeout);
          setStatus("connected");
          startTimers();
        }
      };
      readinessTimer = window.setInterval(updateReadiness, 400);
      readinessTimeout = window.setTimeout(() => {
        window.clearInterval(readinessTimer);
        if (!disposed && !timersStarted) {
          setStatus("error");
        }
      }, 15_000);
      updateReadiness();
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
      void connectPeerDirectory().catch(() => {
        if (!disposed) {
          setStatus("error");
        }
      });
    }

    return () => {
      disposed = true;
      window.clearInterval(publishTimer);
      window.clearInterval(pruneTimer);
      window.clearInterval(readinessTimer);
      window.clearTimeout(readinessTimeout);
      const closeLobby = hostLobby
        ? send({
            kind: "lobby-close",
            roomCode: hostLobby.roomCode,
            hostClientId: hostLobby.hostClientId
          })
        : Promise.resolve(true);
      void peerRoom?.leave();
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
