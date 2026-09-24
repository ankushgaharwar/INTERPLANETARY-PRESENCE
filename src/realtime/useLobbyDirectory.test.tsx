import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomSession } from "./types";
import { useLobbyDirectory } from "./useLobbyDirectory";

const transport = vi.hoisted(() => {
  const relay = {
    publish: vi.fn(async () => true),
    close: vi.fn()
  };
  return {
    relay,
    options: null as null | {
      topic: string;
      onMessage: (value: unknown) => void;
      onStatus: (
        status: "connecting" | "connected" | "disconnected" | "error"
      ) => void;
    }
  };
});

vi.mock("./peerTransport", () => ({
  PEER_DIRECTORY_ROOM: "test-directory",
  connectInternetRelay: vi.fn(async (options: NonNullable<typeof transport.options>) => {
    transport.options = options;
    return transport.relay;
  })
}));

describe("useLobbyDirectory peer transport", () => {
  beforeEach(() => {
    transport.relay.publish.mockClear();
    transport.relay.close.mockClear();
    transport.options = null;
  });

  it("advertises a host through the internet directory", async () => {
    const session: RoomSession = {
      roomCode: "MOON1234",
      clientId: "host-client",
      displayName: "Alex",
      station: "moon",
      avatar: "nova",
      role: "father"
    };

    const { unmount } = renderHook(() => useLobbyDirectory(session));

    await waitFor(() => expect(transport.options).not.toBeNull());
    act(() => transport.options?.onStatus("connected"));

    await waitFor(() => {
      expect(transport.relay.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "lobby-open",
          lobby: expect.objectContaining({
            roomCode: "MOON1234",
            hostName: "Alex",
            hostStation: "moon"
          })
        })
      );
    });

    unmount();
  });

  it("shows an open lobby received from a remote peer", async () => {
    const { result, unmount } = renderHook(() => useLobbyDirectory(null));

    await waitFor(() => expect(transport.options).not.toBeNull());
    act(() => {
      transport.options?.onStatus("connected");
      transport.options?.onMessage({
        kind: "lobby-open",
        lobby: {
          roomCode: "EARTH567",
          hostClientId: "remote-host",
          hostName: "Maya",
          hostStation: "earth",
          hostAvatar: "atlas",
          advertisedAt: Date.now()
        }
      });
    });

    expect(result.current.lobbies).toEqual([
      expect.objectContaining({ roomCode: "EARTH567", hostName: "Maya" })
    ]);

    unmount();
  });
});

