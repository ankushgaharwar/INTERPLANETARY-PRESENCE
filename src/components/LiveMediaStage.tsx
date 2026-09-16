import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Radio,
  ScanLine,
  ShieldCheck,
  Video,
  Volume2,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { STATION_BY_ID } from "../realtime/stations";
import type { MediaCallStatus } from "../realtime/useMediaCall";
import type { StationId } from "../realtime/types";
import type {
  ConversationMessage,
  Participant,
  TransmissionEvent
} from "../simulation/types";
import { PresenceRail } from "./PresenceRail";
import type { PresenceFormId } from "../simulation/types";

type MonitorStage = "idle" | "voice" | "video" | "pointCloud";

interface LiveMediaStageProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaStatus: MediaCallStatus;
  mediaError: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  localParticipant: Participant;
  localStation: StationId;
  remoteStation: StationId;
  localName: string;
  remoteName: string;
  focusMessage: ConversationMessage;
  focusEvents: TransmissionEvent[];
  simulationTime: number;
  selectedForm: PresenceFormId;
  turnStage: string;
  hasLiveMessages: boolean;
  reducedMotion: boolean;
  onEnableMedia: () => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onSelectForm: (form: PresenceFormId) => void;
}

const useVideoStream = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null
) => {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = stream;
    if (stream) {
      void video.play().catch(() => undefined);
    }
    return () => {
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream, videoRef]);
};

const getMonitorStage = (
  events: TransmissionEvent[],
  simulationTime: number,
  hasLiveMessages: boolean
): MonitorStage => {
  if (!hasLiveMessages) {
    return "idle";
  }
  const voice = events.find((event) => event.presenceForm === "voice");
  const video = events.find((event) => event.presenceForm === "expression");
  const pointCloud = events.find(
    (event) => event.presenceForm === "pointCloud"
  );
  if (!voice || simulationTime < voice.renderReadyAt) {
    return "voice";
  }
  if (!video || simulationTime < video.renderReadyAt) {
    return "voice";
  }
  if (!pointCloud || simulationTime < pointCloud.networkArrivalTime) {
    return "video";
  }
  return "pointCloud";
};

const PointCloudCanvas = ({
  video,
  reducedMotion
}: {
  video: React.RefObject<HTMLVideoElement | null>;
  reducedMotion: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleCanvas = useMemo(() => document.createElement("canvas"), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d", { alpha: false });
    const sampleContext = sampleCanvas.getContext("2d", {
      willReadFrequently: true
    });
    if (!context || !sampleContext) {
      return;
    }

    sampleCanvas.width = 112;
    sampleCanvas.height = 63;
    let frame = 0;
    let animationFrame = 0;

    const drawFallback = (width: number, height: number, time: number) => {
      const unit = Math.min(width, height);
      const pulse = reducedMotion ? 0 : Math.sin(time / 420) * unit * 0.005;
      context.fillStyle = "#07090d";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "rgba(239, 143, 197, 0.78)";
      for (let y = 0; y < 38; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const nx = (x - 32) / 32;
          const ny = (y - 19) / 19;
          const head = nx * nx + (ny + 0.42) * (ny + 0.42) < 0.055;
          const body = Math.abs(nx) < 0.2 + (ny + 0.05) * 0.06 && ny > -0.2;
          const desk = ny > 0.44 && ny < 0.53 && Math.abs(nx) < 0.8;
          const room = (x % 13 === 0 && y > 4) || (y === 5 && x > 4 && x < 59);
          if (head || body || desk || room) {
            context.beginPath();
            context.arc(
              ((x + 0.5) / 64) * width,
              ((y + 0.5) / 38) * height + pulse,
              Math.max(0.7, unit * 0.0025),
              0,
              Math.PI * 2
            );
            context.fill();
          }
        }
      }
    };

    const draw = (time: number) => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const source = video.current;
      if (!source || source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        drawFallback(width, height, time);
      } else {
        sampleContext.drawImage(
          source,
          0,
          0,
          sampleCanvas.width,
          sampleCanvas.height
        );
        const pixels = sampleContext.getImageData(
          0,
          0,
          sampleCanvas.width,
          sampleCanvas.height
        ).data;
        context.fillStyle = "#07090d";
        context.fillRect(0, 0, width, height);

        const pointSize = Math.max(0.8, Math.min(width, height) * 0.0035);
        for (let y = 1; y < sampleCanvas.height; y += 2) {
          for (let x = 1; x < sampleCanvas.width; x += 2) {
            const index = (y * sampleCanvas.width + x) * 4;
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const luminance = red * 0.21 + green * 0.72 + blue * 0.07;
            if (luminance < 18) {
              continue;
            }
            const depthOffset = reducedMotion
              ? 0
              : Math.sin(time / 370 + x * 0.21 + y * 0.12) * pointSize;
            context.fillStyle = `rgba(${Math.min(255, red + 42)}, ${Math.min(220, green + 18)}, ${Math.min(255, blue + 55)}, ${0.38 + luminance / 510})`;
            context.beginPath();
            context.arc(
              (x / sampleCanvas.width) * width + depthOffset,
              (y / sampleCanvas.height) * height,
              pointSize,
              0,
              Math.PI * 2
            );
            context.fill();
          }
        }
      }

      frame += 1;
      if (!reducedMotion || frame < 2) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [reducedMotion, sampleCanvas, video]);

  return <canvas ref={canvasRef} className="point-cloud-video" aria-hidden="true" />;
};

const mediaStatusCopy: Record<MediaCallStatus, string> = {
  idle: "Camera and microphone are off",
  requesting: "Requesting device access",
  ready: "Media ready · waiting for partner",
  connecting: "Establishing encrypted media link",
  connected: "Live peer-to-peer media",
  error: "Media connection needs attention"
};

export function LiveMediaStage({
  localStream,
  remoteStream,
  mediaStatus,
  mediaError,
  cameraEnabled,
  microphoneEnabled,
  localParticipant,
  localStation,
  remoteStation,
  localName,
  remoteName,
  focusMessage,
  focusEvents,
  simulationTime,
  selectedForm,
  turnStage,
  hasLiveMessages,
  reducedMotion,
  onEnableMedia,
  onToggleCamera,
  onToggleMicrophone,
  onSelectForm
}: LiveMediaStageProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const monitorVideoRef = useRef<HTMLVideoElement>(null);
  const monitorStage = getMonitorStage(
    focusEvents,
    simulationTime,
    hasLiveMessages
  );
  const localIsSender = focusMessage.sender === localParticipant;
  const monitorStream = localIsSender ? localStream : remoteStream;
  const voiceEvent = focusEvents.find((event) => event.presenceForm === "voice");
  const pointEvent = focusEvents.find(
    (event) => event.presenceForm === "pointCloud"
  );
  const remoteAudioReady = Boolean(
    !localIsSender &&
      voiceEvent &&
      simulationTime >= voiceEvent.renderReadyAt
  );
  const pointProgress = pointEvent
    ? Math.min(
        1,
        Math.max(
          0,
          (simulationTime - pointEvent.networkArrivalTime) /
            Math.max(0.01, pointEvent.reconstructionTime)
        )
      )
    : 0;

  useVideoStream(localVideoRef, localStream);
  useVideoStream(monitorVideoRef, monitorStream);

  const monitorLabel =
    monitorStage === "voice"
      ? "Voice arriving"
      : monitorStage === "video"
        ? "Live video · expression and motion"
        : monitorStage === "pointCloud"
          ? pointProgress < 1
            ? `Reconstructing point cloud · ${Math.round(pointProgress * 100)}%`
            : "Point cloud present"
          : "Waiting for first transmission";

  return (
    <div className="live-media-stage" data-station={localStation}>
      <video
        ref={localVideoRef}
        className={`local-media ${cameraEnabled ? "" : "is-camera-off"}`}
        autoPlay
        playsInline
        muted
      />
      {!localStream || !cameraEnabled ? (
        <div className="local-media-placeholder">
          {localStream ? <CameraOff aria-hidden="true" /> : <Video aria-hidden="true" />}
          <strong>{localStream ? "Camera paused" : "Start your live presence"}</strong>
          {!localStream ? (
            <button type="button" onClick={onEnableMedia} disabled={mediaStatus === "requesting"}>
              <Camera aria-hidden="true" />
              {mediaStatus === "requesting" ? "Requesting access" : "Enable camera & microphone"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="local-media-topline">
        <div>
          <span>Your live view</span>
          <strong>{localName} · {STATION_BY_ID[localStation].label}</strong>
        </div>
        <div className={`media-connection is-${mediaStatus}`}>
          {mediaStatus === "connected" ? <ShieldCheck aria-hidden="true" /> : <Radio aria-hidden="true" />}
          <span>{mediaStatusCopy[mediaStatus]}</span>
        </div>
      </div>

      <div className="media-controls" aria-label="Camera and microphone controls">
        <button
          type="button"
          title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          aria-pressed={!cameraEnabled}
          disabled={!localStream}
          onClick={onToggleCamera}
        >
          {cameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}
        </button>
        <button
          type="button"
          title={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
          aria-label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
          aria-pressed={!microphoneEnabled}
          disabled={!localStream}
          onClick={onToggleMicrophone}
        >
          {microphoneEnabled ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
        </button>
      </div>

      <section className={`remote-monitor is-${monitorStage}`} aria-label="Remote presence monitor">
        <div className="monitor-heading">
          <div>
            <span>Remote monitor · {STATION_BY_ID[remoteStation].label}</span>
            <strong>{remoteName}</strong>
          </div>
          <small>{localIsSender ? "Outgoing" : "Incoming"}</small>
        </div>

        <div className="monitor-viewport">
          <video
            ref={monitorVideoRef}
            className="monitor-video"
            autoPlay
            playsInline
            muted={!remoteAudioReady}
          />
          {monitorStage === "pointCloud" ? (
            <PointCloudCanvas video={monitorVideoRef} reducedMotion={reducedMotion} />
          ) : null}
          {monitorStage === "voice" ? (
            <div className="voice-reception" aria-hidden="true">
              <Volume2 />
              <div>{[0, 1, 2, 3, 4, 5, 6].map((index) => <i key={index} />)}</div>
            </div>
          ) : null}
          {monitorStage === "idle" ? (
            <div className="monitor-idle" aria-hidden="true">
              {remoteStream ? <Radio /> : <WifiOff />}
            </div>
          ) : null}
          {monitorStage === "pointCloud" ? <ScanLine className="scan-icon" aria-hidden="true" /> : null}
        </div>

        <div className="monitor-status">
          <span>{monitorLabel}</span>
          <div aria-hidden="true">
            <i className={monitorStage !== "idle" ? "is-active" : ""} />
            <i className={monitorStage === "video" || monitorStage === "pointCloud" ? "is-active" : ""} />
            <i className={monitorStage === "pointCloud" ? "is-active" : ""} />
          </div>
        </div>
      </section>

      <div className="live-stage-caption" aria-live="polite">
        <span>{turnStage}</span>
        <p>“{focusMessage.text}”</p>
      </div>

      {mediaError ? <div className="media-error" role="alert">{mediaError}</div> : null}

      <PresenceRail
        events={focusEvents}
        simulationTime={simulationTime}
        selectedForm={selectedForm}
        onSelect={onSelectForm}
      />
    </div>
  );
}
