import { ArrowRight, Check, Circle, Radio, Send } from "lucide-react";
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
  connectionStatusText: string;
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
  connectionStatusText,
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
    ? connectionStatusText
    : !peerConnected
      ? "Waiting for the second person to join"
      : !localTurn
        ? `Waiting for ${participantNames[nextSender]}`
        : !lastSent
          ? `${participantNames[nextSender]}'s next turn · voice leads`
          : activeSend
            ? `${participantNames[activeSend.sender]} sending ${PRESENCE_BY_ID[activeSend.presenceForm].shortLabel}`
            : complete
              ? `Full presence received · ${participantNames[nextSender]} can reply`
              : `Waiting for ${participantNames[lastSent.recipient]} to receive all three forms`;

  return (
    <section className="presence-composer" aria-label="Transmit presence">
      <div className="composer-status" aria-live="polite">
        <Radio aria-hidden="true" />
        <span>{status}</span>
      </div>

      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage();
        }}
      >
        <div className="composer-turn" aria-label={`${participantNames[nextSender]} to ${participantNames[recipient]}`}>
          <strong>{participantNames[nextSender]}</strong>
          <ArrowRight aria-hidden="true" />
          <span>{participantNames[recipient]}</span>
        </div>

        <label className="composer-input">
          <span className="sr-only">Message</span>
          <textarea
            value={draft}
            maxLength={280}
            rows={1}
            disabled={!canSend}
            placeholder={
              canSend
                ? "Send a presence message..."
                : !peerConnected
                  ? "Waiting for the second person..."
                  : !localTurn
                    ? `Waiting for ${participantNames[nextSender]}...`
                    : "Reply unlocks after point-cloud reconstruction"
            }
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
          aria-label="Transmit presence"
          disabled={!draft.trim() || !canSend}
        >
          <Send aria-hidden="true" />
          <span>Transmit</span>
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
