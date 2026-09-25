import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternetRelayOptions } from "./peerTransport";
import type { RoomSession } from "./types";
import { usePresenceRoom } from "./usePresenceRoom";

const transport = vi.hoisted(() => ({
  options: null as InternetRelayOptions | null,
  relay: { publish: vi.fn(async () => true), close: vi.fn() }
}));
vi.mock("./peerTransport", () => ({
  getPeerRoomName: () => "test/room",
  connectInternetRelay: vi.fn(async (options: InternetRelayOptions) => {
    transport.options = options;
    return transport.relay;
  })
}));
const session: RoomSession = {
  roomCode: "EARTH123", clientId: "host", displayName: "Host",
  station: "earth", avatar: "atlas", role: "father"
};
const context = { source: "broker-one", topic: "test/room" };
const ready = async () => {
  await waitFor(() => expect(transport.options).not.toBeNull());
  await act(async () => {
    transport.options!.onStatus("connected");
    transport.options!.onReady!(transport.relay);
  });
};

describe("internet room messaging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.options = null;
    transport.relay.publish.mockResolvedValue(true);
  });

  it("does not advance the conversation when publication fails", async () => {
    const { result, unmount } = renderHook(() => usePresenceRoom(session));
    await ready();
    transport.relay.publish.mockResolvedValueOnce(false);
    await act(async () => expect(await result.current.sendMessage("Hello")).toBe(false));
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toContain("not sent");
    unmount();
  });

  it("deduplicates broker copies without reordering a reply from a slow device clock", async () => {
    const { result, unmount } = renderHook(() => usePresenceRoom(session));
    await ready();
    await act(async () => { await result.current.sendMessage("Hello"); });
    const reply = { kind: "message", message: {
      id: "reply-1", roomCode: session.roomCode, senderId: "guest", senderName: "Guest",
      senderRole: "daughter", senderStation: "moon", text: "Reply", sentAt: 1
    } };
    act(() => {
      transport.options!.onMessage(reply, context);
      transport.options!.onMessage(reply, { ...context, source: "broker-two" });
    });
    expect(result.current.messages.map((message) => message.text)).toEqual(["Hello", "Reply"]);
    unmount();
  });

  it("renews presence and requests history after reconnecting", async () => {
    const { result, unmount } = renderHook(() => usePresenceRoom(session));
    await ready();
    transport.relay.publish.mockClear();
    act(() => transport.options!.onStatus("error"));
    expect(result.current.error).not.toBe("");
    await ready();
    expect(result.current.error).toBe("");
    expect(transport.relay.publish).toHaveBeenCalledWith({ kind: "hello", clientId: "host" });
    expect(transport.relay.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: "presence" }));
    unmount();
  });
});
