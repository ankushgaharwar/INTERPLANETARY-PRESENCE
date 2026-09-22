import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("allows the first message to run as a solo preview", async () => {
    render(<PresenceComposer {...defaultProps} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    const send = screen.getByRole("button", { name: "Send message" });

    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Message ready for orbit" } });
    expect(input).toHaveValue("Message ready for orbit");
    expect(send).toBeEnabled();
    expect(send).toHaveAttribute("title", "Send message");
    expect(screen.getByText("Ready to send")).toBeInTheDocument();
    fireEvent.click(send);
    expect(defaultProps.onSend).toHaveBeenCalledWith("Message ready for orbit");
    await waitFor(() => expect(input).toHaveValue(""));
  });
});
