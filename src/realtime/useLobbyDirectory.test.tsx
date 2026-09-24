import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomSession } from "./types";
import { useLobbyDirectory } from "./useLobbyDirectory";

const transport = vi.hoisted(() => {
  const action = {
    send: vi.fn(async () => undefined),
    onMessage: null as null | ((value: unknown, context: { peerId: string }) => void)
  };
  const room = {
    makeAction: vi.fn(() => action),
    onPeerJoin: null as null | ((peerId: string) => void),
    onPeerLeave: null as null | ((peerId: string) => void),
    leave: vi.fn(async () => undefined)
  };
  return { action, room };
});

vi.mock("@trystero-p2p/mqtt", () => ({
  getRelaySockets: () => ({ relay: { readyState: 1 } }),
  joinRoom: vi.fn(() => transport.room)
}));

describe("useLobbyDirectory peer transport", () => {
  beforeEach(() => {
    transport.action.send.mockClear();
    transport.action.onMessage = null;
    transport.room.makeAction.mockClear();
    transport.room.leave.mockClear();
    transport.room.onPeerJoin = null;
    transport.room.onPeerLeave = null;
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

    await waitFor(() => {
      expect(transport.action.send).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "lobby-open",
          lobby: expect.objectContaining({
            roomCode: "MOON1234",
            hostName: "Alex",
            hostStation: "moon"
          })
        }),
        { target: undefined }
      );
    });

    unmount();
  });

  it("shows an open lobby received from a remote peer", async () => {
    const { result, unmount } = renderHook(() => useLobbyDirectory(null));

    await waitFor(() => expect(transport.action.onMessage).not.toBeNull());
    act(() => {
      transport.action.onMessage?.(
        {
          kind: "lobby-open",
          lobby: {
            roomCode: "EARTH567",
            hostClientId: "remote-host",
            hostName: "Maya",
            hostStation: "earth",
            hostAvatar: "atlas",
            advertisedAt: Date.now()
          }
        },
        { peerId: "remote-peer" }
      );
    });

    expect(result.current.lobbies).toEqual([
      expect.objectContaining({ roomCode: "EARTH567", hostName: "Maya" })
    ]);

    unmount();
  });
});
