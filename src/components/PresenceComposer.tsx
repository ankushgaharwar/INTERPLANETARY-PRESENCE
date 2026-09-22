import { Check, Circle, Radio, Send } from "lucide-react";
import { useState } from "react";
import {
  PRESENCE_BY_ID,
  PRESENCE_SEQUENCE,
  PRESENCE_STAGGER_SECONDS
} from "../simulation/presence";
import type { Participant, TransmissionEvent } from "../simulation/types";

export interface SentPresenceReceipt {
  messageId: string;
  recipient: Participant;
  sentAt: number;
}

interface PresenceComposerProps {
  simulationTime: number;
  lastSent: SentPresenceReceipt | null;
  transmissionEvents: TransmissionEvent[];
  nextSender: Participant;
  localParticipant: Participant;
  participantNames: Record<Participant, string>;
  connectionReady: boolean;
  peerConnected: boolean;
  onSend: (text: string) => Promise<boolean>;
}

const getRecipient = (sender: Participant): Participant =>
  sender === "daughter" ? "father" : "daughter";

export function PresenceComposer({
  simulationTime,
  lastSent,
  transmissionEvents,
  nextSender,
  localParticipant,
  participantNames,
  connectionReady,
  peerConnected,
  onSend
}: PresenceComposerProps) {
  const [draft, setDraft] = useState("");
  const orderedEvents = [...transmissionEvents].sort(
    (first, second) =>
      PRESENCE_SEQUENCE.indexOf(first.presenceForm) -
      PRESENCE_SEQUENCE.indexOf(second.presenceForm)
  );

  const finalEvent = orderedEvents.at(-1);
  const complete = finalEvent ? simulationTime >= finalEvent.renderReadyAt : false;
  const localTurn = nextSender === localParticipant;
  const canSend =
    (!lastSent || complete) && localTurn && connectionReady && peerConnected;

  const submitMessage = async () => {
    const message = draft.trim();
    if (!message || !canSend) {
      return;
    }

    const sent = await onSend(message);
    if (sent) {
      setDraft("");
    }
  };

  const activeSend = orderedEvents.find(
    (event) =>
      simulationTime >= event.sentAt &&
      simulationTime < event.sentAt + PRESENCE_STAGGER_SECONDS
  );
  const recipient = getRecipient(nextSender);
  const status = !connectionReady
    ? "Connecting to the shared room"
    : !peerConnected
      ? "Waiting for the second person to join"
      : !localTurn
        ? `Waiting for ${participantNames[nextSender]}`
        : !lastSent
          ? `${participantNames[nextSender]}'s next turn · text leads`
          : activeSend
            ? `${participantNames[activeSend.sender]} sending ${PRESENCE_BY_ID[activeSend.presenceForm].shortLabel}`
            : complete
              ? `Full presence received · ${participantNames[nextSender]} can reply`
              : `Waiting for ${participantNames[lastSent.recipient]} to receive all four stages`;
  const turnSummary = !connectionReady
    ? "Connecting"
    : !peerConnected
      ? "Room open"
      : canSend
        ? `Your turn · to ${participantNames[recipient]}`
        : !localTurn
          ? `${participantNames[nextSender]}'s turn`
          : "Receiving presence";
  const draftPlaceholder = canSend
    ? "Send a chat message..."
    : !connectionReady
      ? "Write while the room connects..."
      : !peerConnected
        ? "Write a message while waiting for the second person..."
        : !localTurn
          ? `Write your reply while ${participantNames[nextSender]} transmits...`
          : "Write your reply while presence reconstruction finishes...";
  const sendTitle = !connectionReady
    ? "Send unlocks when the room connects"
    : !peerConnected
      ? "Send unlocks when the second person joins"
      : !localTurn
        ? `Send unlocks after ${participantNames[nextSender]}'s turn`
        : !complete && lastSent
          ? "Send unlocks after point-cloud reconstruction"
          : "Send message";

  return (
    <section className="presence-composer" aria-label="Transmit presence">
      <div className="composer-status" aria-live="polite">
        <div className="composer-status-copy">
          <Radio aria-hidden="true" />
          <span>
            <strong>Live transmission</strong>
            <small>{status}</small>
          </span>
        </div>
        <span className="composer-turn">{turnSummary}</span>
      </div>

      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage();
        }}
      >
        <label className="composer-input">
          <span className="sr-only">Message</span>
          <textarea
            value={draft}
            maxLength={280}
            rows={1}
            placeholder={draftPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
          />
        </label>

        <button
          className="send-presence"
          type="submit"
          aria-label="Send message"
          title={sendTitle}
          disabled={!draft.trim() || !canSend}
        >
          <Send aria-hidden="true" />
          <span>Send</span>
        </button>
      </form>

      <ol className="composer-sequence" aria-label="Transmission sequence">
        {PRESENCE_SEQUENCE.map((form, index) => {
          const event = orderedEvents.find(
            (candidate) => candidate.presenceForm === form
          );
          const sending = event
            ? simulationTime >= event.sentAt &&
              simulationTime < event.sentAt + PRESENCE_STAGGER_SECONDS
            : false;
          const launched = event ? simulationTime >= event.sentAt : false;
          const arrived = event ? simulationTime >= event.renderReadyAt : false;

          return (
            <li
              key={form}
              className={arrived ? "is-complete" : sending ? "is-sending" : ""}
            >
              {arrived ? (
                <Check aria-hidden="true" />
              ) : launched ? (
                <Radio aria-hidden="true" />
              ) : (
                <Circle aria-hidden="true" />
              )}
              <span>{index + 1}. {PRESENCE_BY_ID[form].shortLabel}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
