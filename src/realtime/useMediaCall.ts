import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { realtimeConfig } from "./config";
import type {
  MediaSignal,
  OutgoingMediaSignal,
  RoomPeer,
  RoomSession
} from "./types";

export type MediaCallStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "connecting"
  | "connected"
  | "error";

interface UseMediaCallOptions {
  session: RoomSession;
  peers: RoomPeer[];
  signals: MediaSignal[];
  sendSignal: (signal: OutgoingMediaSignal) => Promise<boolean>;
}

export function useMediaCall({
  session,
  peers,
  signals,
  sendSignal
}: UseMediaCallOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaCallStatus>("idle");
  const [error, setError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const remoteReadyRef = useRef(false);
  const negotiatingRef = useRef(false);
  const processedSignalsRef = useRef(new Set<string>());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const sendSignalRef = useRef(sendSignal);

  const remotePeer = useMemo(
    () => peers.find((peer) => peer.clientId !== session.clientId) ?? null,
    [peers, session.clientId]
  );

  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  const closePeerConnection = useCallback(() => {
    const peerConnection = peerConnectionRef.current;
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    }
    peerConnectionRef.current = null;
    remotePeerIdRef.current = null;
    remoteReadyRef.current = false;
    negotiatingRef.current = false;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
  }, []);

  const createPeerConnection = useCallback(
    (remotePeerId: string) => {
      const existing = peerConnectionRef.current;
      if (existing && remotePeerIdRef.current === remotePeerId) {
        return existing;
      }

      closePeerConnection();
      const peerConnection = new RTCPeerConnection({
        iceServers: realtimeConfig.iceServers
      });
      peerConnectionRef.current = peerConnection;
      remotePeerIdRef.current = remotePeerId;

      localStreamRef.current?.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current as MediaStream);
      });

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }
        void sendSignalRef.current({
          kind: "candidate",
          targetId: remotePeerId,
          candidate: event.candidate.toJSON()
        });
      };
      peerConnection.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          setRemoteStream(stream);
          return;
        }
        setRemoteStream(
          new MediaStream(peerConnection.getReceivers().flatMap((receiver) =>
            receiver.track ? [receiver.track] : []
          ))
        );
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          setStatus("connected");
          setError("");
        } else if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "closed"
        ) {
          setStatus("error");
          setError(
            realtimeConfig.hasTurnServer
              ? "The camera link ended. Rejoin the room to reconnect."
              : "The direct camera link failed. Configure TURN for restrictive networks."
          );
        } else if (peerConnection.connectionState === "connecting") {
          setStatus("connecting");
        }
      };
      setStatus("connecting");
      return peerConnection;
    },
    [closePeerConnection]
  );

  const flushPendingCandidates = useCallback(
    async (peerConnection: RTCPeerConnection) => {
      if (!peerConnection.remoteDescription) {
        return;
      }
      const candidates = pendingCandidatesRef.current.splice(0);
      for (const candidate of candidates) {
        await peerConnection.addIceCandidate(candidate);
      }
    },
    []
  );

  const createOffer = useCallback(
    async (remotePeerId: string) => {
      if (!localStreamRef.current || negotiatingRef.current) {
        return;
      }
      const peerConnection = createPeerConnection(remotePeerId);
      if (peerConnection.signalingState !== "stable") {
        return;
      }

      negotiatingRef.current = true;
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await sendSignalRef.current({
          kind: "offer",
          targetId: remotePeerId,
          description: offer
        });
      } finally {
        negotiatingRef.current = false;
      }
    },
    [createPeerConnection]
  );

  const enableMedia = useCallback(async () => {
    if (localStreamRef.current) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Camera and microphone access requires HTTPS or localhost.");
      return;
    }

    setStatus("requesting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraEnabled(stream.getVideoTracks().some((track) => track.enabled));
      setMicrophoneEnabled(stream.getAudioTracks().some((track) => track.enabled));
      setStatus(remotePeer ? "connecting" : "ready");
      if (remotePeer) {
        await sendSignalRef.current({
          kind: "media-ready",
          targetId: remotePeer.clientId
        });
        if (session.role === "father" && remoteReadyRef.current) {
          await createOffer(remotePeer.clientId);
        }
      }
    } catch (mediaError) {
      const denied =
        mediaError instanceof DOMException &&
        (mediaError.name === "NotAllowedError" ||
          mediaError.name === "PermissionDeniedError");
      setStatus("error");
      setError(
        denied
          ? "Camera and microphone permission was not granted."
          : "Camera and microphone could not be started."
      );
    }
  }, [createOffer, remotePeer, session.role]);

  useEffect(() => {
    if (!localStream || !remotePeer || status === "connected") {
      return;
    }

    const announceReady = () => {
      void sendSignalRef.current({
        kind: "media-ready",
        targetId: remotePeer.clientId
      });
      if (session.role === "father" && remoteReadyRef.current) {
        void createOffer(remotePeer.clientId);
      }
    };
    announceReady();
    const heartbeat = window.setInterval(announceReady, 2_000);
    return () => window.clearInterval(heartbeat);
  }, [createOffer, localStream, remotePeer, session.role, status]);

  useEffect(() => {
    if (remotePeer || !peerConnectionRef.current) {
      return;
    }
    closePeerConnection();
    if (localStreamRef.current) {
      setStatus("ready");
    }
  }, [closePeerConnection, remotePeer]);

  useEffect(() => {
    let disposed = false;

    const processSignals = async () => {
      for (const signal of signals) {
        if (
          disposed ||
          processedSignalsRef.current.has(signal.id) ||
          signal.senderId === session.clientId ||
          (signal.targetId && signal.targetId !== session.clientId)
        ) {
          continue;
        }

        if (signal.kind === "media-ready") {
          processedSignalsRef.current.add(signal.id);
          remoteReadyRef.current = true;
          if (localStreamRef.current && session.role === "father") {
            await createOffer(signal.senderId);
          }
          continue;
        }

        if (!localStreamRef.current) {
          continue;
        }

        const peerConnection = createPeerConnection(signal.senderId);
        if (signal.kind === "offer" && signal.description) {
          processedSignalsRef.current.add(signal.id);
          await peerConnection.setRemoteDescription(signal.description);
          await flushPendingCandidates(peerConnection);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          await sendSignalRef.current({
            kind: "answer",
            targetId: signal.senderId,
            description: answer
          });
        } else if (signal.kind === "answer" && signal.description) {
          processedSignalsRef.current.add(signal.id);
          await peerConnection.setRemoteDescription(signal.description);
          await flushPendingCandidates(peerConnection);
        } else if (signal.kind === "candidate" && signal.candidate) {
          processedSignalsRef.current.add(signal.id);
          if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(signal.candidate);
          } else {
            pendingCandidatesRef.current.push(signal.candidate);
          }
        }
      }
    };

    void processSignals().catch(() => {
      if (!disposed) {
        setStatus("error");
        setError("The secure camera connection could not be negotiated.");
      }
    });
    return () => {
      disposed = true;
    };
  }, [
    createOffer,
    createPeerConnection,
    flushPendingCandidates,
    localStream,
    session.clientId,
    session.role,
    signals
  ]);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const enabled = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    setCameraEnabled(enabled);
  }, []);

  const toggleMicrophone = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const enabled = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    setMicrophoneEnabled(enabled);
  }, []);

  useEffect(
    () => () => {
      closePeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    },
    [closePeerConnection]
  );

  return {
    localStream,
    remoteStream,
    status,
    error,
    cameraEnabled,
    microphoneEnabled,
    enableMedia,
    toggleCamera,
    toggleMicrophone
  } as const;
}
