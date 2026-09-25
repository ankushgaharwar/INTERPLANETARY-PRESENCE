import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomLobby } from "./RoomLobby";

describe("RoomLobby", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("creates a room from the selected station", () => {
    const onEnter = vi.fn();
    render(
      <RoomLobby
        lobbies={[]}
        directoryStatus="connected"
        onEnter={onEnter}
      />
    );

    expect(screen.queryByLabelText("Room code")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Alex" }
    });
    fireEvent.click(screen.getByRole("radio", { name: /Moon/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Nova/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create open lobby" }));

    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Alex",
        role: "father",
        station: "moon",
        avatar: "nova",
        roomCode: expect.stringMatching(/^[A-Z0-9]{8}$/)
      })
    );
  });

  it("joins a visible host without asking for a room code", () => {
    const onEnter = vi.fn();
    render(
      <RoomLobby
        lobbies={[
          {
            roomCode: "MOON42",
            hostClientId: "host-1",
            hostName: "Alex",
            hostStation: "earth",
            hostAvatar: "atlas",
            advertisedAt: Date.now()
          }
        ]}
        directoryStatus="connected"
        onEnter={onEnter}
      />
    );

    expect(screen.getByRole("heading", { name: "Open lobbies" })).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText(/Hosting from Earth/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Room code")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Maya" }
    });
    fireEvent.click(screen.getByRole("radio", { name: /Sol/ }));
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /Earth/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Atlas/ })).toBeDisabled();
    expect(screen.getAllByText("Selected by host")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: /Earth/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Atlas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Join lobby" }));

    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Maya",
        role: "daughter",
        station: "moon",
        avatar: "sol",
        roomCode: "MOON42"
      })
    );
  });
});
