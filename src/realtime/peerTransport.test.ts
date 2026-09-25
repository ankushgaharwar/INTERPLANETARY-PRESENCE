import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectInternetRelay, type InternetRelay } from "./peerTransport";

const network = vi.hoisted(() => {
  class Client {
    connected = false;
    callbacks = new Map<string, (...args: any[]) => void>();
    constructor(public url: string, public options: any) {}
    on(event: string, callback: (...args: any[]) => void) { this.callbacks.set(event, callback); }
    emit(event: string, ...args: any[]) { this.callbacks.get(event)?.(...args); }
    subscribe = vi.fn((_topic, _options, callback) => callback(null, [{ qos: 1 }]));
    publish = vi.fn((_topic, _payload, _options, callback) => callback(null));
    end = vi.fn();
    reconnect = vi.fn();
  }
  const clients: Client[] = [];
  return { clients, connect: vi.fn((url, options) => {
    const client = new Client(url, options);
    clients.push(client);
    return client;
  }) };
});

// Match MQTT.js's browser bundle, which exports connect on default only.
vi.mock("mqtt", () => ({ connect: undefined, default: { connect: network.connect } }));

describe("internet relay", () => {
  let relay: InternetRelay;
  beforeEach(() => { network.clients.length = 0; vi.clearAllMocks(); });
  afterEach(() => { relay?.close(); vi.useRealTimers(); });

  const connect = async (topic = "test/room") => {
    const onMessage = vi.fn();
    const onStatus = vi.fn();
    const onReady = vi.fn();
    relay = await connectInternetRelay({ topic, onMessage, onStatus, onReady });
    return { onMessage, onStatus, onReady };
  };
  const ready = (index: number) => {
    network.clients[index].connected = true;
    network.clients[index].emit("connect");
  };

  it("uses the browser export and includes a standard-port internet connection", async () => {
    const { onStatus, onReady } = await connect();
    expect(network.clients.some((client) => new URL(client.url).port === "")).toBe(true);
    expect(await relay.publish({ text: "before subscription" })).toBe(false);
    ready(0);
    expect(onStatus).toHaveBeenLastCalledWith("connected");
    expect(onReady).toHaveBeenCalledWith(relay);
    expect(await relay.publish({ text: "hello" })).toBe(true);
    expect(network.clients[0].publish).toHaveBeenCalledWith(
      "test/room", expect.any(String), expect.objectContaining({ qos: 1, retain: false }), expect.any(Function)
    );
  });

  it("does not report a connection whose subscription was rejected", async () => {
    const { onStatus } = await connect();
    network.clients[0].subscribe.mockImplementationOnce((_topic, _options, cb) => cb(null, [{ qos: 128 }]));
    ready(0);
    expect(onStatus).not.toHaveBeenCalledWith("connected");
    expect(await relay.publish({ text: "hello" })).toBe(false);
  });

  it("returns failure when connected brokers reject a message", async () => {
    await connect();
    ready(0);
    network.clients[0].publish.mockImplementationOnce((_topic, _payload, _options, cb) => cb(new Error("denied")));
    expect(await relay.publish({ text: "hello" })).toBe(false);
  });

  it("receives retained wildcard listings and their removal without cross-broker loss", async () => {
    const { onMessage } = await connect("test/lobbies/+");
    const bytes = { length: 100, toString: () => JSON.stringify({
      id: "listing-1", senderId: "other", payload: { kind: "lobby-open" }
    }) };
    network.clients[0].emit("message", "test/lobbies/abc", bytes);
    network.clients[0].emit("message", "test/lobbies/abc", bytes);
    network.clients[1].emit("message", "test/lobbies/abc", bytes);
    network.clients[1].emit("message", "test/lobbies/abc", { length: 0 });
    expect(onMessage).toHaveBeenCalledTimes(3);
    expect(onMessage).toHaveBeenLastCalledWith(null, {
      topic: "test/lobbies/abc", source: network.clients[1].url
    });
  });

  it("waits for retained removal to reach all connected brokers", async () => {
    await connect("test/lobbies/+");
    ready(0);
    ready(1);
    let acknowledge!: (error: null) => void;
    network.clients[1].publish.mockImplementationOnce((_topic, _payload, _options, cb) => { acknowledge = cb; });
    const completed = vi.fn();
    const pending = relay.publish(null, { topic: "test/lobbies/abc", retain: true }).then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    acknowledge(null);
    await pending;
    expect(completed).toHaveBeenCalledWith(true);
  });

  it("recovers after a disconnect and republishes through onReady", async () => {
    const { onStatus, onReady } = await connect();
    ready(0);
    network.clients[0].connected = false;
    network.clients[0].emit("close");
    expect(onStatus).toHaveBeenLastCalledWith("connecting");
    window.dispatchEvent(new Event("online"));
    expect(network.clients[0].reconnect).toHaveBeenCalled();
    ready(0);
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it("shows an error after repeated failed reconnects instead of waiting forever", async () => {
    vi.useFakeTimers();
    const { onStatus } = await connect();
    for (let attempt = 0; attempt < 6; attempt++) {
      await vi.advanceTimersByTimeAsync(3_000);
      network.clients[0].emit("close");
    }
    expect(onStatus).toHaveBeenLastCalledWith("error");
    ready(0);
    expect(onStatus).toHaveBeenLastCalledWith("connected");
  });
});
