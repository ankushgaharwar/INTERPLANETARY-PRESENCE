import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlaybackControls, type AppMode } from "./components/PlaybackControls";
import {
  PresenceComposer,
  type SentPresenceReceipt
} from "./components/PresenceComposer";
import { PresenceRail } from "./components/PresenceRail";
import { RoomBar } from "./components/RoomBar";
import { RoomLobby } from "./components/RoomLobby";
import { SpatialScene } from "./components/SpatialScene";
import { SystemDesign } from "./components/SystemDesign";
import { getStationDistanceMeters, STATION_BY_ID } from "./realtime/stations";
import type { RoomPeer, RoomSession, StationId } from "./realtime/types";
import { usePresenceRoom } from "./realtime/usePresenceRoom";
import { createReferenceSettings } from "./simulation/constants";
import { formatClock, formatSeconds } from "./simulation/format";
import {
  buildTransmissionEvents,
  getNextEventTime
} from "./simulation/SignalEngine";
import { SimulationClock } from "./simulation/SimulationClock";
import type {
  ConversationMessage,
  Participant,
  PresenceFormId,
  ScientificSettings
} from "./simulation/types";

const CLOCK_DURATION_SECONDS = 1200;
const WAITING_MESSAGE: ConversationMessage = {
  id: "waiting-room",
  sentAt: 0,
  sender: "father",
  text: "Waiting for the first presence transmission.",
  action: "waits beside the shared display"
};

const getRecipient = (sender: Participant): Participant =>
  sender === "daughter" ? "father" : "daughter";

const getTurnStage = (
  focusEvents: ReturnType<typeof buildTransmissionEvents>,
  simulationTime: number,
  sender: Participant,
  recipient: Participant,
  participantNames: Record<Participant, string>
) => {
  const voice = focusEvents.find((event) => event.presenceForm === "voice");
  const expression = focusEvents.find(
    (event) => event.presenceForm === "expression"
  );
  const pointCloud = focusEvents.find(
    (event) => event.presenceForm === "pointCloud"
  );

  if (voice && simulationTime < voice.renderReadyAt) {
    return `${participantNames[sender]} speaking · voice traveling to ${participantNames[recipient]}`;
  }
  if (expression && simulationTime < expression.renderReadyAt) {
    return "Voice received · expression, motion and intent next";
  }
  if (pointCloud && simulationTime < pointCloud.networkArrivalTime) {
    return "Embodied cues received · point cloud next";
  }
  if (pointCloud && simulationTime < pointCloud.renderReadyAt) {
    return `Point cloud reconstructing for ${participantNames[recipient]}`;
  }
  return `Full presence received · ${participantNames[recipient]}'s reply unlocked`;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const getPeer = (
  peers: RoomPeer[],
  role: Participant,
  session: RoomSession
) =>
  peers.find((peer) => peer.role === role) ??
  (session.role === role
    ? { ...session, joinedAt: new Date().toISOString() }
    : undefined);

const getFallbackStation = (
  role: Participant,
  session: RoomSession
): StationId => {
  if (session.role === role) {
    return session.station;
  }
  return role === "father" ? "earth" : "moon";
};

interface LiveSessionProps {
  session: RoomSession;
  onLeave: () => void;
}

function LiveSession({ session, onLeave }: LiveSessionProps) {
  const room = usePresenceRoom(session);
  const [settings, setSettings] = useState<ScientificSettings>(() =>
    createReferenceSettings()
  );
  const fatherPeer = getPeer(room.peers, "father", session);
  const daughterPeer = getPeer(room.peers, "daughter", session);
  const fatherStation =
    fatherPeer?.station ?? getFallbackStation("father", session);
  const daughterStation =
    daughterPeer?.station ?? getFallbackStation("daughter", session);
  const participantNames = useMemo<Record<Participant, string>>(
    () => ({
      father: fatherPeer?.displayName ?? "First participant",
      daughter: daughterPeer?.displayName ?? "Second participant"
    }),
    [daughterPeer?.displayName, fatherPeer?.displayName]
  );
  const distanceMeters = getStationDistanceMeters(
    fatherStation,
    daughterStation
  );
  const activeSettings = useMemo(
    () => ({ ...settings, earthMoonDistanceMeters: distanceMeters }),
    [distanceMeters, settings]
  );
  const liveMessages = useMemo<ConversationMessage[]>(
    () =>
      room.messages.map((message) => ({
        id: message.id,
        sentAt: 0,
        sender: message.senderRole,
        text: message.text,
        action: "speaks, looks and reaches"
      })),
    [room.messages]
  );
  const hasLiveMessages = liveMessages.length > 0;
  const messages = hasLiveMessages ? liveMessages : [WAITING_MESSAGE];
  const events = useMemo(
    () => buildTransmissionEvents(messages, activeSettings),
    [activeSettings, messages]
  );

  const clockRef = useRef(new SimulationClock(CLOCK_DURATION_SECONDS));
  const previousTimeRef = useRef(0);
  const spokenEventsRef = useRef(new Set<string>());
  const animationRef = useRef<number | null>(null);
  const observedMessagesRef = useRef(0);

  const [mode, setMode] = useState<AppMode>("experience");
  const [simulationTime, setSimulationTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [selectedForm, setSelectedForm] =
    useState<PresenceFormId>("voice");

  const focusEvent = useMemo(
    () =>
      [...events]
        .reverse()
        .find((event) => event.captureTime <= simulationTime) ?? events[0],
    [events, simulationTime]
  );
  const focusMessage = useMemo(
    () =>
      messages.find((message) => message.id === focusEvent?.messageId) ??
      messages[0],
    [focusEvent?.messageId, messages]
  );
  const focusEvents = useMemo(
    () => events.filter((event) => event.messageId === focusMessage.id),
    [events, focusMessage.id]
  );
  const lastMessage = liveMessages.at(-1);
  const lastSent: SentPresenceReceipt | null = lastMessage
    ? {
        messageId: lastMessage.id,
        recipient: getRecipient(lastMessage.sender),
        sentAt: lastMessage.sentAt
      }
    : null;
  const lastSentEvents = useMemo(
    () =>
      lastSent
        ? events.filter((event) => event.messageId === lastSent.messageId)
        : [],
    [events, lastSent]
  );
  const recipient = getRecipient(focusMessage.sender);
  const nextSender = lastMessage
    ? getRecipient(lastMessage.sender)
    : "father";
  const propagationTime =
    activeSettings.earthMoonDistanceMeters /
    activeSettings.speedOfLightMetersPerSecond;
  const peerConnected = room.peers.some(
    (peer) => peer.clientId !== session.clientId
  );
  const roomFull = room.peers.length > 2;
  const turnStage = hasLiveMessages
    ? getTurnStage(
        focusEvents,
        simulationTime,
        focusMessage.sender,
        recipient,
        participantNames
      )
    : "Waiting for the first presence transmission";

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const tick = (realTime: number) => {
      const nextTime = clockRef.current.tick(realTime);
      setSimulationTime(nextTime);
      if (clockRef.current.isRunning) {
        animationRef.current = window.requestAnimationFrame(tick);
      } else {
        setIsRunning(false);
      }
    };

    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    const nextCount = room.messages.length;
    if (nextCount <= observedMessagesRef.current) {
      observedMessagesRef.current = nextCount;
      return;
    }

    observedMessagesRef.current = nextCount;
    const latestMessage = room.messages.at(-1);
    const captureTime =
      events.find((event) => event.messageId === latestMessage?.id)?.captureTime ??
      0;
    const now = performance.now();

    if (nextCount === 1) {
      clockRef.current.reset(now);
      previousTimeRef.current = 0;
      spokenEventsRef.current.clear();
      setSimulationTime(0);
      clockRef.current.start(now);
    } else {
      if (clockRef.current.time < captureTime) {
        clockRef.current.pause(now);
        clockRef.current.stepTo(captureTime, now);
        setSimulationTime(captureTime);
      }
      clockRef.current.resume(now);
    }

    clockRef.current.setSpeed(speed, now);
    setHasStarted(true);
    setIsRunning(true);
    setMode("experience");
    setSelectedForm("voice");
  }, [events, room.messages, speed]);

  useEffect(() => {
    if (!isRunning || !lastMessage) {
      return;
    }
    const lastTurnEvents = events.filter(
      (event) => event.messageId === lastMessage.id
    );
    const turnReadyAt = Math.max(
      ...lastTurnEvents.map((event) => event.renderReadyAt)
    );
    if (Number.isFinite(turnReadyAt) && simulationTime >= turnReadyAt) {
      const now = performance.now();
      clockRef.current.pause(now);
      clockRef.current.stepTo(turnReadyAt, now);
      setSimulationTime(turnReadyAt);
      setIsRunning(false);
    }
  }, [events, isRunning, lastMessage, simulationTime]);

  useEffect(() => {
    const previousTime = previousTimeRef.current;
    const arrivedVoice = events.filter(
      (event) =>
        event.presenceForm === "voice" &&
        event.networkArrivalTime > previousTime &&
        event.networkArrivalTime <= simulationTime &&
        !spokenEventsRef.current.has(event.id)
    );

    arrivedVoice.forEach((event) => {
      spokenEventsRef.current.add(event.id);
      if (!muted && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(event.text);
        utterance.lang = "en-US";
        utterance.pitch = event.sender === "daughter" ? 1.08 : 0.9;
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    });

    previousTimeRef.current = simulationTime;
  }, [events, muted, simulationTime]);

  const startSimulation = () => {
    window.speechSynthesis?.cancel();
    const now = performance.now();
    clockRef.current.reset(now);
    clockRef.current.start(now);
    clockRef.current.setSpeed(speed, now);
    previousTimeRef.current = 0;
    spokenEventsRef.current.clear();
    setSimulationTime(0);
    setHasStarted(true);
    setIsRunning(true);
    setSelectedForm("voice");
  };

  const pauseSimulation = () => {
    const pausedAt = clockRef.current.pause(performance.now());
    window.speechSynthesis?.pause();
    setSimulationTime(pausedAt);
    setIsRunning(false);
  };

  const resumeSimulation = () => {
    window.speechSynthesis?.resume();
    clockRef.current.resume(performance.now());
    setHasStarted(true);
    setIsRunning(true);
  };

  const resetSimulation = () => {
    window.speechSynthesis?.cancel();
    clockRef.current.reset(performance.now());
    previousTimeRef.current = 0;
    spokenEventsRef.current.clear();
    setSimulationTime(0);
    setIsRunning(false);
    setHasStarted(false);
    setSpeed(1);
    setSelectedForm("voice");
  };

  const stepSimulation = () => {
    window.speechSynthesis?.cancel();
    const target = getNextEventTime(events, simulationTime);
    clockRef.current.pause(performance.now());
    clockRef.current.stepTo(target, performance.now());
    setSimulationTime(target);
    setHasStarted(true);
    setIsRunning(false);
  };

  const changeSpeed = (nextSpeed: number) => {
    clockRef.current.setSpeed(nextSpeed, performance.now());
    setSpeed(nextSpeed);
  };

  return (
    <main className={`app-shell ${reducedMotion ? "reduce-motion" : ""}`}>
      <header className="app-header">
        <div className="brand-block">
          <p>Interplanetary Presence</p>
          <h1>Earth · Moon · Space Station</h1>
        </div>
        <PlaybackControls
          mode={mode}
          isRunning={isRunning}
          hasStarted={hasStarted}
          speed={speed}
          muted={muted}
          reducedMotion={reducedMotion}
          onModeChange={setMode}
          onStart={startSimulation}
          onPause={pauseSimulation}
          onResume={resumeSimulation}
          onReset={resetSimulation}
          onStep={stepSimulation}
          onSpeedChange={changeSpeed}
          onMutedChange={setMuted}
          onReducedMotionChange={setReducedMotion}
        />
      </header>

      <RoomBar
        session={session}
        peers={room.peers}
        status={room.status}
        transport={room.transport}
        onLeave={onLeave}
      />

      {room.error || roomFull ? (
        <div className="room-alert" role="alert">
          {roomFull ? "This room already has two participants." : room.error}
        </div>
      ) : null}

      {mode === "experience" ? (
        <section className="experience-view" aria-labelledby="experience-title">
          <header className="experience-heading">
            <div>
              <p className="eyebrow">shared spatial session</p>
              <h2 id="experience-title">Presence arrives in layers</h2>
            </div>
            <div className="experience-context">
              <div
                className="turn-route"
                aria-label={`${participantNames[focusMessage.sender]} to ${participantNames[recipient]}`}
              >
                <span>{participantNames[focusMessage.sender]}</span>
                <ArrowRight aria-hidden="true" />
                <span>{participantNames[recipient]}</span>
              </div>
              <div className="stage-metrics">
                <span>{(distanceMeters / 1000).toLocaleString()} km</span>
                <span>{formatSeconds(propagationTime)} one-way</span>
                <strong>{formatClock(simulationTime)}</strong>
              </div>
            </div>
          </header>

          <div className="spatial-stage">
            <SpatialScene
              events={events}
              focusMessageId={focusMessage.id}
              simulationTime={simulationTime}
              selectedForm={selectedForm}
              reducedMotion={reducedMotion}
              fatherStation={fatherStation}
              daughterStation={daughterStation}
            />

            <div
              className={`participant-label father-label ${focusMessage.sender === "father" ? "is-active" : ""}`}
            >
              <span>
                {focusMessage.sender === "father"
                  ? "Transmitting"
                  : "Receiving on monitor"}
              </span>
              <strong>
                {STATION_BY_ID[fatherStation].label} · {participantNames.father}
              </strong>
            </div>
            <div
              className={`participant-label daughter-label ${focusMessage.sender === "daughter" ? "is-active" : ""}`}
            >
              <span>
                {focusMessage.sender === "daughter"
                  ? "Transmitting"
                  : "Receiving on monitor"}
              </span>
              <strong>
                {STATION_BY_ID[daughterStation].label} · {participantNames.daughter}
              </strong>
            </div>

            <div className="live-transcript" aria-live="polite">
              <span>{turnStage}</span>
              <p>“{focusMessage.text}”</p>
            </div>

            <PresenceRail
              events={focusEvents}
              simulationTime={simulationTime}
              selectedForm={selectedForm}
              onSelect={setSelectedForm}
            />
          </div>
        </section>
      ) : (
        <SystemDesign settings={activeSettings} onChange={setSettings} />
      )}

      <PresenceComposer
        simulationTime={simulationTime}
        lastSent={lastSent}
        transmissionEvents={lastSentEvents}
        nextSender={nextSender}
        localParticipant={session.role}
        participantNames={participantNames}
        connectionReady={room.status === "connected" && !roomFull}
        peerConnected={peerConnected}
        onSend={room.sendMessage}
      />
    </main>
  );
}

function App() {
  const [session, setSession] = useState<RoomSession | null>(null);

  const enterRoom = (nextSession: RoomSession) => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", nextSession.roomCode);
    window.history.replaceState({}, "", url);
    setSession(nextSession);
  };

  const leaveRoom = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
    window.speechSynthesis?.cancel();
    setSession(null);
  };

  return session ? (
    <LiveSession session={session} onLeave={leaveRoom} />
  ) : (
    <RoomLobby onEnter={enterRoom} />
  );
}

export default App;
