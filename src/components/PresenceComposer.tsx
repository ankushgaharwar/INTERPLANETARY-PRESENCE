import { Check, Circle, Radio, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  PRESENCE_BY_ID,
  PRESENCE_SEQUENCE,
  PRESENCE_STAGGER_SECONDS
} from "../simulation/presence";
import type { Participant, TransmissionEvent } from "../simulation/types";

interface PresenceComposerProps {
  simulationTime: number;
  transmissionEvents: TransmissionEvent[];
  localParticipant: Participant;
  participantNames: Record<Participant, string>;
  connectionReady: boolean;
  peerConnected: boolean;
  conversation: { id: string; senderName: string; text: string; mine: boolean }[];
  onSend: (text: string) => Promise<boolean>;
}

const getRecipient = (sender: Participant): Participant =>
  sender === "daughter" ? "father" : "daughter";

export function PresenceComposer({
  simulationTime,
  transmissionEvents,
  localParticipant,
  participantNames,
  connectionReady,
  peerConnected,
  conversation,
  onSend
}: PresenceComposerProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const conversationRef = useRef<HTMLOListElement>(null);
  const latestVisibleId = conversation.at(-1)?.id;
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [latestVisibleId]);
  const orderedEvents = [...transmissionEvents].sort(
    (first, second) =>
      PRESENCE_SEQUENCE.indexOf(first.presenceForm) -
      PRESENCE_SEQUENCE.indexOf(second.presenceForm)
  );

  const canSend = connectionReady;

  const submitMessage = async () => {
    const message = draft.trim();
    if (!message || !canSend || sendingRef.current) {
      return;
    }

    sendingRef.current = true;
    setSending(true);
    try {
      const sent = await onSend(message);
      if (sent) setDraft((current) => current.trim() === message ? "" : current);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const activeSend = orderedEvents.find(
    (event) =>
      simulationTime >= event.sentAt &&
      simulationTime < event.sentAt + PRESENCE_STAGGER_SECONDS
  );
  const recipient = getRecipient(localParticipant);
  const status = !connectionReady
    ? "Connecting to the shared room"
    : activeSend
      ? `${participantNames[activeSend.sender]} sending ${PRESENCE_BY_ID[activeSend.presenceForm].shortLabel}`
      : peerConnected
        ? "Both people connected"
        : "Lobby open for one person";
  const turnSummary = !connectionReady
    ? "Connecting"
    : peerConnected
      ? `Chat with ${participantNames[recipient]}`
      : "Ready to send";
  const draftPlaceholder = canSend
    ? "Send a chat message..."
    : "Write while the room connects...";
  const sendTitle = !connectionReady
    ? "Send unlocks when the room connects"
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

      {conversation.length > 0 ? (
        <ol className="composer-conversation" aria-label="Conversation" aria-live="polite" ref={conversationRef}>
          {conversation.map((message) => (
            <li key={message.id} className={message.mine ? "is-mine" : ""}>
              <strong>{message.mine ? "You" : message.senderName}</strong>
              <span>{message.text}</span>
            </li>
          ))}
        </ol>
      ) : null}

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
          disabled={!draft.trim() || !canSend || sending}
        >
          <Send aria-hidden="true" />
          <span>{sending ? "Sending..." : "Send"}</span>
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
