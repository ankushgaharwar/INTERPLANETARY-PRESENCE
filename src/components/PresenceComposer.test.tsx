import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresenceComposer } from "./PresenceComposer";
import { createReferenceSettings } from "../simulation/constants";
import { buildTransmissionEvents } from "../simulation/SignalEngine";

const defaultProps = {
  simulationTime: 0,
  transmissionEvents: [],
  localParticipant: "father" as const,
  participantNames: {
    father: "Alex",
    daughter: "Maya"
  },
  connectionReady: true,
  peerConnected: false,
  conversation: [],
  onSend: vi.fn(async () => true)
};

describe("PresenceComposer", () => {
  beforeEach(() => defaultProps.onSend.mockClear());

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

  it("allows either person to send again while a message is still in transit", async () => {
    const transmissionEvents = buildTransmissionEvents([{
      id: "first", sentAt: 0, sender: "father", text: "First message",
      action: "speaks"
    }], createReferenceSettings());
    render(<PresenceComposer {...defaultProps} localParticipant="daughter"
      peerConnected transmissionEvents={transmissionEvents} simulationTime={1}
      conversation={[{ id: "first", senderName: "Alex", text: "First message", mine: false }]} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    const send = screen.getByRole("button", { name: "Send message" });
    expect(screen.getByRole("list", { name: "Conversation" })).toHaveTextContent("First message");
    fireEvent.change(input, { target: { value: "Reply before the point cloud" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(input).toHaveValue(""));
    fireEvent.change(input, { target: { value: "Another message" } });
    fireEvent.click(send);
    await waitFor(() => expect(defaultProps.onSend).toHaveBeenCalledTimes(2));
    expect(defaultProps.onSend).toHaveBeenNthCalledWith(1, "Reply before the point cloud");
    expect(defaultProps.onSend).toHaveBeenNthCalledWith(2, "Another message");
  });
});
