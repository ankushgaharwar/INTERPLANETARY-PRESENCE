import { PRESENCE_FORMS } from "../simulation/presence";
import { formatSeconds } from "../simulation/format";
import { getSnapshot } from "../simulation/SignalEngine";
import type { PresenceFormId, TransmissionEvent } from "../simulation/types";

interface PresenceRailProps {
  events: TransmissionEvent[];
  simulationTime: number;
  selectedForm: PresenceFormId;
}

const stateLabels = {
  queued: "Queued",
  travelling: "In transit",
  arrived: "Arrived",
  decoding: "Reconstructing",
  visible: "Present",
  expired: "Memory"
};

export function PresenceRail({
  events,
  simulationTime,
  selectedForm
}: PresenceRailProps) {
  return (
    <div className="presence-rail" role="list" aria-label="Automatic transmission sequence">
      {PRESENCE_FORMS.map((form, index) => {
        const event = events.find((candidate) => candidate.presenceForm === form.id);
        const snapshot = event ? getSnapshot(event, simulationTime) : null;
        const state = snapshot?.state ?? "queued";
        const progress = snapshot
          ? state === "decoding"
            ? Math.min(
                1,
                Math.max(
                  0,
                  (simulationTime - snapshot.event.networkArrivalTime) /
                    snapshot.event.reconstructionTime
                )
              )
            : snapshot.progress
          : 0;

        return (
          <div
            role="listitem"
            key={form.id}
            className={`presence-step ${selectedForm === form.id ? "is-selected" : ""}`}
            aria-current={selectedForm === form.id ? "step" : undefined}
          >
            <span className="step-index">0{index + 1}</span>
            <span className="step-copy">
              <strong>
                <span className="full-form-label">{form.label}</span>
                <span className="short-form-label">{form.shortLabel}</span>
              </strong>
              <small>{form.principle}</small>
            </span>
            <span className={`step-state state-${state}`}>
              {stateLabels[state]}
              {event ? ` · ${formatSeconds(event.renderReadyAt)}` : ""}
            </span>
            <span className="step-progress" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
