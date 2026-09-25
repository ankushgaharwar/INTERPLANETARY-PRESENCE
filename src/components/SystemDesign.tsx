import {
  Box,
  Eye,
  Glasses,
  Mic2,
  Move3d,
  RadioTower,
  ScanFace,
  Timer,
  UsersRound
} from "lucide-react";
import { PRESENCE_FORMS, PRESENCE_STAGGER_SECONDS } from "../simulation/presence";
import { formatPayload, formatSeconds } from "../simulation/format";
import { calculateArrivalOffset } from "../simulation/SignalEngine";
import type { ScientificSettings } from "../simulation/types";

interface SystemDesignProps {
  settings: ScientificSettings;
  onChange: (settings: ScientificSettings) => void;
}

const pipeline = [
  { label: "Capture", detail: "Text · face · body · room depth", icon: ScanFace },
  { label: "Encode", detail: "Four progressive streams", icon: Box },
  { label: "Transport", detail: "Deep-space optical link", icon: RadioTower },
  { label: "Reconstruct", detail: "Audio · rig · body + scene", icon: Move3d },
  { label: "VR render", detail: "World-locked at human scale", icon: Glasses },
  { label: "Open channel", detail: "Both directions stay available", icon: UsersRound }
];

const vrCues = [
  {
    title: "Spatial anchoring",
    detail: "World-locked sound and bodies remain stable as the viewer turns.",
    icon: Eye
  },
  {
    title: "Gaze and intent",
    detail: "Eye line, face and gesture make attention legible before full geometry arrives.",
    icon: UsersRound
  },
  {
    title: "Scale and distance",
    detail: "A 1:1 body, furniture and believable distance support co-location.",
    icon: Move3d
  },
  {
    title: "Temporal coherence",
    detail: "Visible staging explains latency instead of disguising mismatched cues.",
    icon: Timer
  }
];

export function SystemDesign({ settings, onChange }: SystemDesignProps) {
  const propagation =
    settings.earthMoonDistanceMeters / settings.speedOfLightMetersPerSecond;

  return (
    <section className="system-view" aria-labelledby="system-title">
      <header className="system-intro">
        <div>
          <p className="eyebrow">presence architecture</p>
          <h2 id="system-title">From signal to shared space</h2>
        </div>
        <p>
          VR presence increases as cues become spatially coherent. The system
          sends text first, converts the same message into voice, adds social
          motion, then rebuilds the person and surrounding room. Both people
          can send while earlier transmissions continue.
        </p>
      </header>

      <div className="system-flow" aria-label="Capture to VR rendering pipeline">
        {pipeline.map(({ label, detail, icon: Icon }, index) => (
          <div className="flow-node" key={label}>
            <span className="flow-index">0{index + 1}</span>
            <Icon aria-hidden="true" />
            <strong>{label}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      <div className="system-layout">
        <section className="delivery-model" aria-labelledby="delivery-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">progressive fidelity</p>
              <h3 id="delivery-title">Automatic presence sequence</h3>
            </div>
            <span>{formatSeconds(propagation)} physical floor</span>
          </div>

          <div className="delivery-rows">
            {PRESENCE_FORMS.map((form, index) => {
              const networkArrival =
                index * PRESENCE_STAGGER_SECONDS +
                calculateArrivalOffset(settings.payloadBits[form.id], settings);
              const readyAt =
                networkArrival +
                (form.id === "pointCloud"
                  ? settings.pointCloudReconstructionSeconds
                  : 0);

              return (
                <article className="delivery-row" key={form.id}>
                  <span className="delivery-number">0{index + 1}</span>
                  <div>
                    <h4>{form.label}</h4>
                    <p>{form.principle}</p>
                  </div>
                  <div className="delivery-metric">
                    <strong>{formatSeconds(readyAt)}</strong>
                    <small>{formatPayload(settings.payloadBits[form.id])}</small>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="system-equation">
            <span>per-message sequence</span>
            <strong>text → generated voice → expression, motion & intent → point cloud</strong>
          </div>
        </section>

        <section className="vr-impact" aria-labelledby="vr-impact-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">human factors</p>
              <h3 id="vr-impact-title">How VR changes presence</h3>
            </div>
          </div>
          <div className="cue-list">
            {vrCues.map(({ title, detail, icon: Icon }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h4>{title}</h4>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="system-tuning" aria-labelledby="tuning-title">
        <div>
          <p className="eyebrow">design variables</p>
          <h3 id="tuning-title">Tune the link</h3>
        </div>
        <label>
          <span>Bandwidth</span>
          <strong>{settings.linkRateMbps} Mbps</strong>
          <input
            type="range"
            min="25"
            max="1000"
            step="25"
            value={settings.linkRateMbps}
            onChange={(event) =>
              onChange({ ...settings, linkRateMbps: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Point-cloud reconstruction</span>
          <strong>{settings.pointCloudReconstructionSeconds.toFixed(1)}s</strong>
          <input
            type="range"
            min="0"
            max="4"
            step="0.1"
            value={settings.pointCloudReconstructionSeconds}
            onChange={(event) =>
              onChange({
                ...settings,
                pointCloudReconstructionSeconds: Number(event.target.value)
              })
            }
          />
        </label>
      </section>
    </section>
  );
}
