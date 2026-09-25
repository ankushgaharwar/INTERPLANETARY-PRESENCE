import type { MqttClient } from "mqtt";
import type { RoomConnectionStatus } from "./types";

const RELAY_URLS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt"
];

export const PEER_DIRECTORY_ROOM =
  "interplanetary-presence/v2/open-lobbies";

export const getPeerRoomName = (roomCode: string) =>
  `interplanetary-presence/v2/rooms/${roomCode.toLowerCase()}`;

interface RelayWireMessage {
  id: string;
  senderId: string;
  payload: unknown;
}

interface InternetRelayOptions {
  topic: string;
  onMessage: (payload: unknown) => void;
  onStatus: (status: RoomConnectionStatus) => void;
}

export interface InternetRelay {
  publish: (payload: unknown) => Promise<boolean>;
  close: () => void;
}

const isRelayWireMessage = (value: unknown): value is RelayWireMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Partial<RelayWireMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.senderId === "string" &&
    "payload" in message
  );
};

export async function connectInternetRelay({
  topic,
  onMessage,
  onStatus
}: InternetRelayOptions): Promise<InternetRelay> {
  const mqttModule = await import("mqtt");
  const connectClient =
    mqttModule.connect ??
    (mqttModule.default as unknown as { connect?: typeof mqttModule.connect })
      ?.connect;
  if (typeof connectClient !== "function") {
    throw new Error("The MQTT browser client could not be loaded.");
  }
  const senderId = `ip_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const clients: MqttClient[] = [];
  const seenMessages = new Set<string>();
  let disposed = false;

  const syncStatus = () => {
    if (!disposed) {
      onStatus(
        clients.some((client) => client.connected) ? "connected" : "connecting"
      );
    }
  };

  RELAY_URLS.forEach((url, index) => {
    const client = connectClient(url, {
      clean: true,
      clientId: `${senderId}_${index}`,
      connectTimeout: 10_000,
      reconnectPeriod: 3_000,
      queueQoSZero: false
    });
    clients.push(client);

    client.on("connect", () => {
      client.subscribe(topic, { qos: 0 }, (error) => {
        if (!error && !disposed) {
          onStatus("connected");
        }
      });
    });
    client.on("message", (incomingTopic, bytes) => {
      if (incomingTopic !== topic || disposed) {
        return;
      }
      try {
        const value = JSON.parse(bytes.toString()) as unknown;
        if (
          !isRelayWireMessage(value) ||
          value.senderId === senderId ||
          seenMessages.has(value.id)
        ) {
          return;
        }
        seenMessages.add(value.id);
        if (seenMessages.size > 500) {
          const oldest = seenMessages.values().next().value;
          if (oldest) {
            seenMessages.delete(oldest);
          }
        }
        onMessage(value.payload);
      } catch {
        // Ignore malformed traffic on the public topic.
      }
    });
    client.on("close", syncStatus);
    client.on("error", () => undefined);
  });

  const connectionTimeout = window.setTimeout(() => {
    if (!disposed && !clients.some((client) => client.connected)) {
      onStatus("error");
    }
  }, 15_000);

  return {
    publish: async (payload) => {
      const activeClients = clients.filter((client) => client.connected);
      if (disposed || activeClients.length === 0) {
        return false;
      }
      const encoded = JSON.stringify({
        id: crypto.randomUUID(),
        senderId,
        payload
      } satisfies RelayWireMessage);
      activeClients.forEach((client) => {
        client.publish(topic, encoded, { qos: 0 });
      });
      return true;
    },
    close: () => {
      disposed = true;
      window.clearTimeout(connectionTimeout);
      clients.forEach((client) => client.end(true));
    }
  };
}

