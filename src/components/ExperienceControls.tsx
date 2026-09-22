import { Volume2, VolumeX } from "lucide-react";

export type AppMode = "experience" | "system";

interface ExperienceControlsProps {
  mode: AppMode;
  muted: boolean;
  onModeChange: (mode: AppMode) => void;
  onMutedChange: (muted: boolean) => void;
}

export function ExperienceControls({
  mode,
  muted,
  onModeChange,
  onMutedChange
}: ExperienceControlsProps) {
  return (
    <div className="experience-controls">
      <nav className="view-tabs" aria-label="Application view">
        <button
          type="button"
          className={mode === "experience" ? "is-active" : ""}
          aria-pressed={mode === "experience"}
          onClick={() => onModeChange("experience")}
        >
          Experience
        </button>
        <button
          type="button"
          className={mode === "system" ? "is-active" : ""}
          aria-pressed={mode === "system"}
          onClick={() => onModeChange("system")}
        >
          System design
        </button>
      </nav>

      <button
        type="button"
        className="icon-button"
        aria-pressed={muted}
        onClick={() => onMutedChange(!muted)}
        aria-label={muted ? "Enable automatic voice" : "Mute automatic voice"}
        title={muted ? "Enable automatic voice" : "Mute automatic voice"}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
    </div>
  );
}
