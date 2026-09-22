import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresenceComposer } from "./PresenceComposer";

const defaultProps = {
  simulationTime: 0,
  lastSent: null,
  transmissionEvents: [],
  nextSender: "father" as const,
  localParticipant: "father" as const,
  participantNames: {
    father: "Alex",
    daughter: "Maya"
  },
  connectionReady: true,
  peerConnected: false,
  onSend: vi.fn(async () => true)
};

describe("PresenceComposer", () => {
  it("keeps the message field editable while send is waiting for a peer", () => {
    const { rerender } = render(<PresenceComposer {...defaultProps} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    const send = screen.getByRole("button", { name: "Send message" });

    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Message ready for orbit" } });
    expect(input).toHaveValue("Message ready for orbit");
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute(
      "title",
      "Send unlocks when the second person joins"
    );

    rerender(<PresenceComposer {...defaultProps} peerConnected />);
    expect(input).toHaveValue("Message ready for orbit");
    expect(send).toBeEnabled();
  });
});
