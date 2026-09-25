import type { MqttClient } from "mqtt";
import type { RoomConnectionStatus } from "./types";

// shiftr's documented public demo credentials, not application secrets.
const RELAYS = [
  { url: "wss://public.cloud.shiftr.io", protocolVersion: 4 as const,
    username: "public", password: "public" },
  { url: "wss://broker.emqx.io:8084/mqtt", protocolVersion: 5 as const },
  { url: "wss://broker.hivemq.com:8884/mqtt", protocolVersion: 5 as const },
  { url: "wss://test.mosquitto.org:8081/mqtt", protocolVersion: 5 as const }
];

export const PEER_DIRECTORY_ROOM = "interplanetary-presence/v3/lobbies/+";
export const getLobbyTopic = (roomCode: string) =>
  `interplanetary-presence/v3/lobbies/${roomCode.toLowerCase()}`;
export const getPeerRoomName = (roomCode: string) =>
  `interplanetary-presence/v3/rooms/${roomCode.toLowerCase()}`;

export interface RelayMessageContext {
  topic: string;
  source: string;
}

export interface RelayPublishOptions {
  topic?: string;
  retain?: boolean;
}

export interface InternetRelay {
  publish: (payload: unknown, options?: RelayPublishOptions) => Promise<boolean>;
  close: () => void;
}

export interface InternetRelayOptions {
  topic: string;
  will?: { topic: string; payload: unknown; retain?: boolean };
  onMessage: (payload: unknown, context: RelayMessageContext) => void;
  onStatus: (status: RoomConnectionStatus) => void;
  onReady?: (relay: InternetRelay) => void;
}

export async function connectInternetRelay({
  topic, will, onMessage, onStatus, onReady
}: InternetRelayOptions): Promise<InternetRelay> {
  const mqttModule = await import("mqtt");
  const connectClient = mqttModule.connect ?? mqttModule.default?.connect;
  if (typeof connectClient !== "function") {
    throw new Error("The MQTT browser client could not be loaded.");
  }
  const senderId = `ip_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const clients: MqttClient[] = [];
  const ready = new Set<MqttClient>();
  const seenMessages = new Set<string>();
  let disposed = false;
  let connectionTimedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const encode = (payload: unknown) => payload === null ? "" : JSON.stringify({
    id: crypto.randomUUID(), senderId, payload
  });

  const checkConnection = () => {
    if (disposed) return;
    if (ready.size) {
      clearTimeout(timeout);
      timeout = undefined;
      connectionTimedOut = false;
      onStatus("connected");
      return;
    }
    onStatus(connectionTimedOut ? "error" : "connecting");
    if (!timeout && !connectionTimedOut) {
      timeout = setTimeout(() => {
        if (!disposed && !ready.size) {
          connectionTimedOut = true;
          onStatus("error");
        }
      }, 15_000);
    }
  };

  const relay: InternetRelay = {
    publish: async (payload, options = {}) => {
      const destination = options.topic ?? topic;
      const active = [...ready].filter((client) => client.connected);
      if (disposed || !active.length || /[+#]/.test(destination)) return false;
      const encoded = encode(payload);
      // Messages need one acknowledgement. Retained directory updates wait
      // for backups too, so clearing a listing completes before disconnecting.
      return new Promise<boolean>((resolve) => {
        let remaining = active.length;
        let acknowledged = false;
        const deadline = setTimeout(() => resolve(acknowledged), 8_000);
        active.forEach((client) => {
          const finish = (error?: Error | null) => {
            remaining--;
            if (!error) acknowledged = true;
            if ((!options.retain && !error) || !remaining) {
              clearTimeout(deadline);
              resolve(acknowledged);
            }
          };
          try {
            client.publish(destination, encoded, {
              qos: 1,
              retain: options.retain ?? false,
              ...(client.options.protocolVersion === 5
                ? { properties: { messageExpiryInterval: 180 } } : {})
            }, finish);
          } catch (error) {
            finish(error as Error);
          }
        });
      });
    },
    close: () => {
      disposed = true;
      clearTimeout(timeout);
      window.removeEventListener("online", reconnect);
      clients.forEach((client) => client.end(true));
      ready.clear();
    }
  };

  const reconnect = () => {
    if (disposed) return;
    clients.filter((client) => !client.connected).forEach((client) => client.reconnect());
  };
  window.addEventListener("online", reconnect);
  checkConnection();

  RELAYS.forEach(({ url, ...options }, index) => {
    const client = connectClient(url, {
      ...options,
      clean: true,
      clientId: `${senderId}_${index}`,
      connectTimeout: 10_000,
      reconnectPeriod: 3_000,
      keepalive: 60,
      queueQoSZero: false,
      resubscribe: false,
      ...(will ? { will: {
        topic: will.topic, payload: encode(will.payload),
        qos: 1 as const, retain: will.retain ?? false
      } } : {})
    });
    clients.push(client);
    client.on("connect", () => {
      client.subscribe(topic, { qos: 1 }, (error, grants) => {
        if (disposed || error || !grants?.length || grants.some((grant) => grant.qos > 2)) return;
        ready.add(client);
        checkConnection();
        onReady?.(relay);
      });
    });
    client.on("message", (incomingTopic, bytes) => {
      if (disposed) return;
      const matches = topic.endsWith("/+")
        ? incomingTopic.startsWith(topic.slice(0, -1)) &&
          !incomingTopic.slice(topic.length - 1).includes("/")
        : incomingTopic === topic;
      if (!matches || bytes.length > 256_000) return;
      const context = { topic: incomingTopic, source: url };
      if (!bytes.length) {
        onMessage(null, context);
        return;
      }
      try {
        const value = JSON.parse(bytes.toString());
        if (!value || typeof value.id !== "string" ||
          value.senderId === senderId || !("payload" in value)) return;
        // Keep directory records per broker so a backup's last will cannot
        // remove a host still connected through another broker.
        const key = `${url}:${value.id}`;
        if (seenMessages.has(key)) return;
        seenMessages.add(key);
        if (seenMessages.size > 1000) seenMessages.delete(seenMessages.values().next().value!);
        onMessage(value.payload, context);
      } catch {
        // Ignore unrelated or malformed traffic on public topics.
      }
    });
    client.on("close", () => {
      ready.delete(client);
      checkConnection();
    });
    client.on("error", () => undefined);
  });
  return relay;
}
