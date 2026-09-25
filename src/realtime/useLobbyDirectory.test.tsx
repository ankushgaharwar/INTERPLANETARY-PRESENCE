import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternetRelayOptions } from "./peerTransport";
import type { OpenLobby, RoomSession } from "./types";
import { useLobbyDirectory } from "./useLobbyDirectory";

const transport = vi.hoisted(() => ({
  relay: { publish: vi.fn(async () => true), close: vi.fn() },
  options: null as InternetRelayOptions | null
}));

vi.mock("./peerTransport", () => ({
  PEER_DIRECTORY_ROOM: "directory/+",
  getLobbyTopic: (code: string) => `directory/${code.toLowerCase()}`,
  connectInternetRelay: vi.fn(async (options: InternetRelayOptions) => {
    transport.options = options;
    return transport.relay;
  })
}));

const lobby: OpenLobby = {
  roomCode: "EARTH567", hostClientId: "remote-host", hostName: "Maya",
  hostStation: "earth", hostAvatar: "atlas", advertisedAt: 1
};
const context = { source: "broker-one", topic: "directory/earth567" };

const ready = async () => {
  await waitFor(() => expect(transport.options).not.toBeNull());
  await act(async () => {
    transport.options!.onStatus("connected");
    transport.options!.onReady?.(transport.relay);
  });
};

describe("internet lobby directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.relay.publish.mockResolvedValue(true);
    transport.options = null;
  });

  it("retains the host listing and reports publication only after acknowledgement", async () => {
    const session: RoomSession = {
      roomCode: "MOON1234", clientId: "host-client", displayName: "Alex",
      station: "moon", avatar: "nova", role: "father"
    };
    const { result, unmount } = renderHook(() => useLobbyDirectory(session));
    expect(result.current.published).toBe(false);
    await ready();
    expect(transport.options!.will).toEqual({
      topic: "directory/moon1234", payload: null, retain: true
    });
    expect(transport.relay.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "lobby-open", lobby: expect.objectContaining({
        roomCode: "MOON1234", hostStation: "moon", hostAvatar: "nova"
      }) }), { topic: "directory/moon1234", retain: true }
    );
    expect(result.current.published).toBe(true);
    expect(result.current.publicationError).toBe(false);
    expect(result.current.lobbies).toHaveLength(1);
    unmount();
    expect(transport.relay.publish).toHaveBeenLastCalledWith(null, {
      topic: "directory/moon1234", retain: true
    });
  });

  it("discovers a retained lobby even when the host clock is far behind", async () => {
    const { result, unmount } = renderHook(() => useLobbyDirectory(null));
    await ready();
    act(() => transport.options!.onMessage({ kind: "lobby-open", lobby }, context));
    expect(result.current.lobbies).toEqual([lobby]);
    unmount();
  });

  it("does not remove an active host when only one backup broker disconnects", async () => {
    const { result, unmount } = renderHook(() => useLobbyDirectory(null));
    await ready();
    act(() => {
      transport.options!.onMessage({ kind: "lobby-open", lobby }, context);
      transport.options!.onMessage({ kind: "lobby-open", lobby }, { ...context, source: "broker-two" });
      transport.options!.onMessage(null, context);
    });
    expect(result.current.lobbies).toHaveLength(1);
    act(() => transport.options!.onMessage(null, { ...context, source: "broker-two" }));
    expect(result.current.lobbies).toHaveLength(0);
    unmount();
  });

  it("does not announce successful publication when every broker rejects it", async () => {
    transport.relay.publish.mockResolvedValue(false);
    const { result, unmount } = renderHook(() => useLobbyDirectory({
      roomCode: "MOON1234", clientId: "host", displayName: "Alex",
      station: "moon", avatar: "nova", role: "father"
    }));
    await ready();
    expect(result.current.published).toBe(false);
    expect(result.current.publicationError).toBe(true);
    expect(result.current.lobbies).toEqual([]);
    unmount();
  });

  it("refreshes the network subscription and ignores messages from disposed connections", async () => {
    const { result, unmount } = renderHook(() => useLobbyDirectory(null));
    await ready();
    const old = transport.options!;
    act(() => result.current.refresh());
    await ready();
    act(() => old.onMessage({ kind: "lobby-open", lobby }, context));
    expect(result.current.lobbies).toEqual([]);
    expect(transport.relay.close).toHaveBeenCalled();
    unmount();
  });
});
