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
    render(<RoomLobby onEnter={onEnter} />);

    expect(screen.queryByLabelText("Room code")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Alex" }
    });
    fireEvent.click(screen.getByRole("radio", { name: /Moon/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Create room" })[1]);

    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Alex",
        role: "father",
        station: "moon",
        roomCode: expect.stringMatching(/^[A-Z0-9]{8}$/)
      })
    );
  });

  it("opens invite links in join mode", () => {
    window.history.replaceState({}, "", "/?room=moon-42");
    const onEnter = vi.fn();
    render(<RoomLobby onEnter={onEnter} />);

    expect(screen.getByRole("heading", { name: "Join a presence room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Room code")).toHaveValue("MOON42");

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Maya" }
    });
    fireEvent.click(screen.getByRole("radio", { name: /Space Station/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Join room" })[1]);

    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Maya",
        role: "daughter",
        station: "spaceStation",
        roomCode: "MOON42"
      })
    );
  });
});
