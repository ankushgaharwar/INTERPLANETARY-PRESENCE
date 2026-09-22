import {
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  StepForward,
  Volume2,
  VolumeX,
  Waves
} from "lucide-react";
import { useRef } from "react";

export type AppMode = "experience" | "system";

interface PlaybackControlsProps {
  mode: AppMode;
  isRunning: boolean;
  hasStarted: boolean;
  speed: number;
  muted: boolean;
  reducedMotion: boolean;
  onModeChange: (mode: AppMode) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onStep: () => void;
  onSpeedChange: (speed: number) => void;
  onMutedChange: (muted: boolean) => void;
  onReducedMotionChange: (enabled: boolean) => void;
}

export function PlaybackControls({
  mode,
  isRunning,
  hasStarted,
  speed,
  muted,
  reducedMotion,
  onModeChange,
  onStart,
  onPause,
  onResume,
  onReset,
  onStep,
  onSpeedChange,
  onMutedChange,
  onReducedMotionChange
}: PlaybackControlsProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menuRef.current?.removeAttribute("open");

  const togglePlayback = () => {
    if (isRunning) {
      onPause();
    } else if (hasStarted) {
      onResume();
    } else {
      onStart();
    }
  };

  return (
    <div className="playback-controls">
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

      <div className="transport-controls" aria-label="Simulation playback">
        <button
          type="button"
          className="icon-button primary-control"
          onClick={togglePlayback}
          aria-label={isRunning ? "Pause simulation" : "Play simulation"}
          title={isRunning ? "Pause" : "Play"}
        >
          {isRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-pressed={muted}
          onClick={() => onMutedChange(!muted)}
          aria-label={muted ? "Unmute voice" : "Mute voice"}
          title={muted ? "Unmute voice" : "Mute voice"}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
        <details className="playback-menu" ref={menuRef}>
          <summary
            className="icon-button"
            aria-label="Playback settings"
            title="Playback settings"
          >
            <Settings2 aria-hidden="true" />
          </summary>
          <div className="playback-menu-panel">
            <button
              type="button"
              onClick={() => {
                onStep();
                closeMenu();
              }}
            >
              <StepForward aria-hidden="true" />
              Next stage
            </button>
            <button
              type="button"
              onClick={() => {
                onReset();
                closeMenu();
              }}
            >
              <RotateCcw aria-hidden="true" />
              Replay
            </button>
            <label className="speed-control">
              <Gauge aria-hidden="true" />
              <span>Speed</span>
              <select
                value={speed}
                aria-label="Playback speed"
                onChange={(event) => {
                  onSpeedChange(Number(event.target.value));
                  closeMenu();
                }}
              >
                {[0.5, 1, 2, 4].map((option) => (
                  <option value={option} key={option}>
                    {option}x
                  </option>
                ))}
              </select>
            </label>
            <label className="motion-toggle">
              <Waves aria-hidden="true" />
              <span>Reduce motion</span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => {
                  onReducedMotionChange(event.target.checked);
                  closeMenu();
                }}
              />
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}
