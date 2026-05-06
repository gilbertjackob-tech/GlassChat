import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { MutableRefObject } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Camera,
  Captions,
  Download,
  Gauge,
  Image as ImageIcon,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorOff,
  MonitorUp,
  Phone,
  PhoneOff,
  PictureInPicture,
  Radio,
  RotateCcw,
  Settings,
  Sparkles,
  Users,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import { useSocket } from "../SocketContext";
import {
  CallData,
  CallFeatureSupport,
  CallMediaState,
  CallQualityStats,
  CallRoom,
  CallStatus,
  User,
} from "../types";
import { cn } from "../lib/utils";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

const getIceConfiguration = (): RTCConfiguration => {
  const raw = (import.meta as any).env?.VITE_ICE_SERVERS_JSON;
  if (!raw) return { iceServers: DEFAULT_ICE_SERVERS };
  try {
    const parsed = JSON.parse(raw);
    const iceServers = Array.isArray(parsed) ? parsed : parsed?.iceServers;
    if (Array.isArray(iceServers) && iceServers.length > 0) {
      return { iceServers };
    }
  } catch (err) {
    console.warn("Invalid VITE_ICE_SERVERS_JSON; falling back to default STUN", err);
  }
  return { iceServers: DEFAULT_ICE_SERVERS };
};

const getCallFeatureSupport = (): CallFeatureSupport => {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };

  return {
    screenShare: !!navigator.mediaDevices?.getDisplayMedia,
    recording: typeof MediaRecorder !== "undefined",
    captions: !!(
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    ),
    pictureInPicture: !!document.pictureInPictureEnabled,
    outputDeviceSelect:
      typeof HTMLMediaElement !== "undefined" &&
      "setSinkId" in HTMLMediaElement.prototype,
  };
};

type BeautyMode =
  | "off"
  | "bw"
  | "vivid"
  | "dreamy"
  | "beauty";

type StartCallDetail = {
  chatId: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar?: string;
  isVideo: boolean;
};

type StartGroupCallDetail = {
  chatId: string;
  chatName: string;
  participantIds: string[];
  isVideo: boolean;
};

type SignalPayload = {
  callId: string;
  chatId: string;
  fromUserId: string;
  toUserId: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  audioMuted?: boolean;
  videoOff?: boolean;
  screenSharing?: boolean;
  quality?: "auto" | "720p" | "1080p" | "2k";
  beautyMode?: BeautyMode;
  roomId?: string;
  mediaState?: CallMediaState;
  stats?: CallQualityStats;
};

interface CallOverlayProps {
  currentUser: User;
}

export function CallOverlay({ currentUser }: CallOverlayProps) {
  const { socket } = useSocket();
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);
  const [activeCall, setActiveCall] = useState<CallData | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [hasError, setHasError] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [videoQuality, setVideoQuality] = useState<"auto" | "720p" | "1080p" | "2k">("1080p");
  const [beautyMode, setBeautyMode] = useState<BeautyMode>("off");
  const [remoteQuality, setRemoteQuality] = useState<"auto" | "720p" | "1080p" | "2k" | undefined>();
  const [remoteBeautyMode, setRemoteBeautyMode] = useState<BeautyMode | undefined>();
  const [localResolution, setLocalResolution] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const [featureSupport] = useState<CallFeatureSupport>(() => getCallFeatureSupport());
  const [callQuality, setCallQuality] = useState<CallQualityStats>({
    label: "unknown",
    updatedAt: Date.now(),
  });
  const [isCallRecording, setIsCallRecording] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [activeGroupRoom, setActiveGroupRoom] = useState<CallRoom | null>(null);
  const [groupParticipantStates, setGroupParticipantStates] = useState<
    Record<string, CallMediaState>
  >({});

  const toggleSwap = (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    setIsSwapped((prev) => !prev);
  };

  // Audio Context for ringtones
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringerIntervalRef = useRef<number | null>(null);

  const playRingtone = useCallback((type: "incoming" | "outgoing") => {
    try {
      if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const playBeep = () => {
          if (ctx.state === "suspended") return;
          
          if (type === "outgoing") {
              const osc1 = ctx.createOscillator();
              const osc2 = ctx.createOscillator();
              const gain = ctx.createGain();
              osc1.connect(gain);
              osc2.connect(gain);
              gain.connect(ctx.destination);
              
              osc1.type = "sine";
              osc2.type = "sine";
              osc1.frequency.value = 440;
              osc2.frequency.value = 480;
              
              gain.gain.setValueAtTime(0, ctx.currentTime);
              gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.1);
              gain.gain.setValueAtTime(0.03, ctx.currentTime + 2.0);
              gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.1);
              
              osc1.start(ctx.currentTime);
              osc2.start(ctx.currentTime);
              osc1.stop(ctx.currentTime + 2.1);
              osc2.stop(ctx.currentTime + 2.1);
          } else {
              const notes = [523.25, 659.25, 783.99, 1046.50];
              const noteDuration = 0.15;
              
              const playSequence = (offset: number) => {
                  notes.forEach((freq, i) => {
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.type = "sine";
                      osc.frequency.value = freq;
                      
                      const startTime = ctx.currentTime + offset + (i * noteDuration);
                      gain.gain.setValueAtTime(0, startTime);
                      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
                      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
                      
                      osc.start(startTime);
                      osc.stop(startTime + noteDuration);
                  });
              };
              
              playSequence(0);
              playSequence(notes.length * noteDuration + 0.1);
          }
      };

      if (ringerIntervalRef.current) window.clearInterval(ringerIntervalRef.current);
      playBeep();
      ringerIntervalRef.current = window.setInterval(playBeep, type === "incoming" ? 3000 : 4000);
    } catch(err) { console.warn("AudioContext failed", err); }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringerIntervalRef.current) {
        window.clearInterval(ringerIntervalRef.current);
        ringerIntervalRef.current = null;
    }
  }, []);


  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isScreenSharingRef = useRef(false);

  const beautyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beautyAnimationRef = useRef<number | null>(null);
  const beautyStreamRef = useRef<MediaStream | null>(null);
  const beautyTrackRef = useRef<MediaStreamTrack | null>(null);
  const beautyVideoRef = useRef<HTMLVideoElement | null>(null);
  const beautyBlurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beautySoftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beautySharpenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pendingOffersRef = useRef<Map<string, SignalPayload>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );
  const peerUserIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const activeCallRef = useRef<CallData | null>(null);
  const incomingCallRef = useRef<CallData | null>(null);
  const callStatusRef = useRef<CallStatus>("idle");
  const timeoutRefs = useRef<number[]>([]);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const previousOutboundStatsRef = useRef<{ bytes: number; timestamp: number } | null>(null);
  const callRecorderRef = useRef<MediaRecorder | null>(null);
  const callRecordingChunksRef = useRef<Blob[]>([]);
  const captionRecognitionRef = useRef<any>(null);
  const activeGroupRoomRef = useRef<CallRoom | null>(null);
  const groupPeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const groupPendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [groupRemoteStreams, setGroupRemoteStreams] = useState<Record<string, MediaStream>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const minimizedRemoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    activeGroupRoomRef.current = activeGroupRoom;
  }, [activeGroupRoom]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    if (callStatus === "incoming_ringing") {
        playRingtone("incoming");
    } else if (callStatus === "outgoing_ringing") {
        playRingtone("outgoing");
    } else {
        stopRingtone();
    }
    callStatusRef.current = callStatus;
  }, [callStatus, playRingtone, stopRingtone]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    const updateResolution = () => {
      const track = localStreamRef.current?.getVideoTracks()[0] || cameraVideoTrackRef.current;
      const settings = track?.getSettings();
      if (settings?.width && settings?.height) {
        setLocalResolution(`${settings.width}x${settings.height}`);
      } else {
        setLocalResolution("");
      }
    };
    const interval = window.setInterval(updateResolution, 2000);
    return () => clearInterval(interval);
  }, [localStream, videoQuality]);

  const clearTimers = () => {
    timeoutRefs.current.forEach((id) => window.clearTimeout(id));
    timeoutRefs.current = [];
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const stopStatsMonitor = () => {
    if (statsIntervalRef.current) {
      window.clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    previousOutboundStatsRef.current = null;
  };

  const stopCallRecording = () => {
    const recorder = callRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    callRecorderRef.current = null;
    setIsCallRecording(false);
  };

  const stopCaptions = () => {
    try {
      captionRecognitionRef.current?.stop?.();
    } catch {
      // Browser speech recognizers can throw if stop is called after ending.
    }
    captionRecognitionRef.current = null;
    setCaptionsEnabled(false);
  };

  const stopTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const stopBeauty = () => {
    if (beautyAnimationRef.current) window.clearTimeout(beautyAnimationRef.current);
    beautyAnimationRef.current = null;
    if (beautyVideoRef.current) {
      beautyVideoRef.current.srcObject = null;
      if (beautyVideoRef.current.parentNode) {
        beautyVideoRef.current.parentNode.removeChild(beautyVideoRef.current);
      }
      beautyVideoRef.current = null;
    }
    stopTracks(beautyStreamRef.current);
    beautyStreamRef.current = null;
    beautyTrackRef.current = null;
  };

  const resetState = () => {
    clearTimers();
    stopStatsMonitor();
    stopCallRecording();
    stopCaptions();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    groupPeerConnectionsRef.current.forEach((pc) => pc.close());
    groupPeerConnectionsRef.current.clear();
    groupPendingIceRef.current.clear();
    stopRingtone();
    stopBeauty();
    stopTracks(screenStreamRef.current);
    stopTracks(localStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    screenStreamRef.current = null;
    cameraVideoTrackRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setScreenStream(null);
    peerUserIdRef.current = null;
    connectedAtRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
    setCallDuration(0);
    setCallStatus("idle");
    setIsMuted(false);
    setIsVideoOff(false);
    setIsMinimized(false);
    setIsScreenSharing(false);
    setRemoteScreenSharing(false);
    setVideoQuality("1080p");
    setBeautyMode("off");
    setRemoteQuality(undefined);
    setRemoteBeautyMode(undefined);
    setLocalResolution("");
    setShowAdvanced(false);
    setCallQuality({ label: "unknown", updatedAt: Date.now() });
    setCaptionText("");
    setActiveGroupRoom(null);
    setGroupParticipantStates({});
    setGroupRemoteStreams({});
    pendingIceCandidatesRef.current.clear();
  };

  const queueIceCandidate = (
    callId: string,
    candidate: RTCIceCandidateInit,
  ) => {
    const queued = pendingIceCandidatesRef.current.get(callId) || [];
    queued.push(candidate);
    pendingIceCandidatesRef.current.set(callId, queued);
  };

  const flushQueuedIceCandidates = async (callId: string) => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;

    const queued = pendingIceCandidatesRef.current.get(callId);
    if (!queued?.length) return;

    pendingIceCandidatesRef.current.delete(callId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Failed to add queued ICE candidate", err);
      }
    }
  };

  const finishAfterStatus = (status: CallStatus, message?: string) => {
    setCallStatus(status);
    if (message) setHasError(message);
    const timeoutId = window.setTimeout(() => {
      setHasError("");
      resetState();
    }, 2500);
    timeoutRefs.current.push(timeoutId);
  };

  const createCallLog = async (data: Omit<CallData, "callId">) => {
    const res = await fetch(`${window.location.origin}/api/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callerId: data.callerId,
        calleeId: data.calleeId,
        chatId: data.chatId,
        type: data.isVideo ? "video" : "audio",
        mode: data.mode || "direct",
        roomId: data.roomId,
        participantIds: data.mode === "group" ? [data.callerId, data.calleeId] : undefined,
        status: "outgoing_calling",
        startedAt: Date.now(),
      }),
    });
    if (!res.ok) throw new Error("Failed to create call log");
    return (await res.json()).id as string;
  };

  const emitSignal = (event: string, data: SignalPayload) => {
    if (!socket || !data.fromUserId || !data.toUserId) return;
    socket.emit(event, data);
  };

  const buildSignal = (
    call: CallData,
    toUserId = peerUserIdRef.current,
  ): SignalPayload | null => {
    if (!toUserId) return null;
    return {
      callId: call.callId,
      chatId: call.chatId,
      fromUserId: currentUser.id,
      toUserId,
    };
  };

  const emitForActiveCall = (event: string, extra: Partial<SignalPayload> = {}) => {
    const call = activeCallRef.current;
    if (!call) return;
    const signal = buildSignal(call);
    if (signal) emitSignal(event, { ...signal, ...extra });
  };

  const emitMediaState = (
    audioMuted = isMuted,
    videoOff = isVideoOff,
    screenSharing = isScreenSharing,
    quality = videoQuality,
    beauty = beautyMode
  ) => {
    emitForActiveCall("call:media-state", {
      audioMuted,
      videoOff,
      screenSharing,
      quality,
      beautyMode: beauty,
    });
  };

  const getIncomingOffer = (call: CallData) => {
    const offerData = pendingOffersRef.current.get(call.callId);
    const offer = call.offer || offerData?.offer;
    const fromUserId = offerData?.fromUserId || call.callerId;
    return offer && fromUserId ? { offer, fromUserId } : null;
  };

  const getVideoConstraints = (quality: "auto" | "720p" | "1080p" | "2k"): MediaTrackConstraints | boolean => {
    if (quality === "2k") return { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30, max: 30 } };
    if (quality === "1080p") return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } };
    if (quality === "720p") return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
    return true;
  };

  const withSelectedVideoDevice = (constraints: MediaTrackConstraints | boolean) => {
    if (!selectedVideoDeviceId) return constraints;
    if (constraints === true) return { deviceId: { exact: selectedVideoDeviceId } };
    return { ...constraints, deviceId: { exact: selectedVideoDeviceId } };
  };

  const getAudioConstraints = (): MediaTrackConstraints => {
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (selectedAudioDeviceId) {
      constraints.deviceId = { exact: selectedAudioDeviceId };
    }
    return constraints;
  };

  const getCameraStreamWithFallback = async (isVideo: boolean, quality: "auto" | "720p" | "1080p" | "2k") => {
    const audioConstraints = getAudioConstraints();
    if (!isVideo) return { stream: await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false }), quality: "auto" as const };
    
    const qualityOrder = quality === "2k" ? ["2k", "1080p", "720p", "auto"] as const
      : quality === "1080p" ? ["1080p", "720p", "auto"] as const
      : quality === "720p" ? ["720p", "auto"] as const
      : ["auto"] as const;

    for (const q of qualityOrder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: withSelectedVideoDevice(getVideoConstraints(q))
        });
        return { stream, quality: q };
      } catch (err) {
        console.warn("Video quality failed, trying fallback", q, err);
      }
    }
    throw new Error("Could not access camera");
  };

  const tuneVideoSender = (sender: RTCRtpSender, quality: "auto" | "720p" | "1080p" | "2k") => {
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    if (!params.encodings.length) params.encodings.push({});

    if (quality === "2k") {
      params.encodings[0].maxBitrate = 6000000;
      params.encodings[0].maxFramerate = 30;
    } else if (quality === "1080p") {
      params.encodings[0].maxBitrate = 3500000;
      params.encodings[0].maxFramerate = 30;
    } else if (quality === "720p") {
      params.encodings[0].maxBitrate = 1800000;
      params.encodings[0].maxFramerate = 30;
    } else {
       delete params.encodings[0].maxBitrate;
       delete params.encodings[0].maxFramerate;
    }
    sender.setParameters(params).catch(console.error);
  };

  const ensureWorkCanvas = (ref: MutableRefObject<HTMLCanvasElement | null>) => {
    if (!ref.current) ref.current = document.createElement("canvas");
    return ref.current;
  };

  const resizeCanvasTo = (target: HTMLCanvasElement, width: number, height: number) => {
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
  };

  const getInitialCanvasSize = (track: MediaStreamTrack | null) => {
    const settings = track?.getSettings();
    const width = typeof settings?.width === "number" ? settings.width : 1280;
    const height = typeof settings?.height === "number" ? settings.height : 720;
    return { width, height };
  };

  const getBeautyCssFilter = (mode?: BeautyMode) => {
    if (mode === "bw") return "grayscale(1) contrast(1.18) brightness(1.05)";
    if (mode === "vivid") return "brightness(1.1) contrast(1.14) saturate(1.34) hue-rotate(-2deg)";
    if (mode === "dreamy") return "brightness(1.12) saturate(0.94) contrast(0.98)";
    if (mode === "beauty") return "brightness(1.08) contrast(1.06) saturate(1.12)";
    return "none";
  };

  const applySkinPixelPass = (
    ctx: CanvasRenderingContext2D,
    blurCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    const left = Math.max(0, Math.floor(width * 0.26));
    const top = Math.max(0, Math.floor(height * 0.16));
    const boxWidth = Math.min(width - left, Math.floor(width * 0.48));
    const boxHeight = Math.min(height - top, Math.floor(height * 0.62));
    if (boxWidth <= 0 || boxHeight <= 0) return;

    let sourceData: ImageData;
    let blurData: ImageData;
    try {
      sourceData = ctx.getImageData(left, top, boxWidth, boxHeight);
      blurData = blurCtx.getImageData(left, top, boxWidth, boxHeight);
    } catch {
      return;
    }

    const data = sourceData.data;
    const smooth = blurData.data;
    const faceCx = boxWidth * 0.5;
    const faceCy = boxHeight * 0.34;
    const faceRx = boxWidth * 0.44;
    const faceRy = boxHeight * 0.34;
    const neckCx = boxWidth * 0.5;
    const neckCy = boxHeight * 0.72;
    const neckRx = boxWidth * 0.36;
    const neckRy = boxHeight * 0.18;

    for (let y = 0; y < boxHeight; y += 1) {
      for (let x = 0; x < boxWidth; x += 1) {
        const faceDistance = ((x - faceCx) ** 2) / (faceRx ** 2) + ((y - faceCy) ** 2) / (faceRy ** 2);
        const neckDistance = ((x - neckCx) ** 2) / (neckRx ** 2) + ((y - neckCy) ** 2) / (neckRy ** 2);
        const ovalWeight = Math.max(
          faceDistance < 1 ? 1 - faceDistance : 0,
          neckDistance < 1 ? (1 - neckDistance) * 0.55 : 0,
        );
        if (ovalWeight <= 0) continue;

        const idx = (y * boxWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const isSkinLike =
          r > 55 &&
          g > 34 &&
          b > 22 &&
          r > b * 1.05 &&
          r >= g * 0.9 &&
          g >= b * 0.72 &&
          maxChannel - minChannel > 12;

        if (!isSkinLike) continue;

        const blend = Math.min(0.24, 0.08 + ovalWeight * 0.2);
        const tone = Math.min(0.12, ovalWeight * 0.1);
        const sr = smooth[idx];
        const sg = smooth[idx + 1];
        const sb = smooth[idx + 2];

        data[idx] = Math.min(255, r * (1 - blend) + sr * blend + 8 * tone);
        data[idx + 1] = Math.min(255, g * (1 - blend) + sg * blend + 5 * tone);
        data[idx + 2] = Math.min(255, b * (1 - blend) + sb * blend + 2 * tone);
      }
    }

    ctx.putImageData(sourceData, left, top);
  };

  const drawBeautyFrame = (
    mode: BeautyMode,
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    resizeCanvasTo(canvas, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (mode === "bw") {
      ctx.filter = "grayscale(1) contrast(1.18) brightness(1.05)";
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = "none";
      return;
    }

    if (mode === "vivid") {
      ctx.filter = "brightness(1.11) contrast(1.18) saturate(1.42) hue-rotate(-3deg)";
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = "none";
      return;
    }

    if (mode === "dreamy") {
      ctx.filter = "brightness(1.16) saturate(0.9) blur(0.8px) contrast(0.96)";
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = "none";
      return;
    }

    ctx.filter = getBeautyCssFilter("beauty");
    ctx.drawImage(video, 0, 0, width, height);
    ctx.filter = "none";

    const blurCanvas = ensureWorkCanvas(beautyBlurCanvasRef);
    resizeCanvasTo(blurCanvas, width, height);
    const blurCtx = blurCanvas.getContext("2d");
    if (blurCtx) {
      const softCanvas = ensureWorkCanvas(beautySoftCanvasRef);
      const softWidth = Math.max(1, Math.floor(width * 0.5));
      const softHeight = Math.max(1, Math.floor(height * 0.5));
      resizeCanvasTo(softCanvas, softWidth, softHeight);
      const softCtx = softCanvas.getContext("2d");
      blurCtx.clearRect(0, 0, width, height);
      blurCtx.imageSmoothingEnabled = true;
      blurCtx.imageSmoothingQuality = "high";
      if (softCtx) {
        softCtx.clearRect(0, 0, softWidth, softHeight);
        softCtx.imageSmoothingEnabled = true;
        softCtx.imageSmoothingQuality = "high";
        softCtx.filter = "brightness(1.08) saturate(1.06)";
        softCtx.drawImage(video, 0, 0, softWidth, softHeight);
        softCtx.filter = "none";
        blurCtx.drawImage(softCanvas, 0, 0, width, height);
      } else {
        blurCtx.drawImage(video, 0, 0, width, height);
      }

      applySkinPixelPass(ctx, blurCtx, width, height);
    }

    const sharpenCanvas = ensureWorkCanvas(beautySharpenCanvasRef);
    resizeCanvasTo(sharpenCanvas, width, height);
    const sharpenCtx = sharpenCanvas.getContext("2d");
    if (sharpenCtx) {
      sharpenCtx.clearRect(0, 0, width, height);
      sharpenCtx.filter = "contrast(1.18) saturate(1.08)";
      sharpenCtx.drawImage(video, 0, 0, width, height);
      sharpenCtx.filter = "none";

      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.16;
      ctx.drawImage(sharpenCanvas, 0, 0, width, height);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = "rgba(255, 232, 210, 0.08)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const applyBeautyMode = (mode: BeautyMode, srcTrack: MediaStreamTrack | null = cameraVideoTrackRef.current) => {
    if (beautyAnimationRef.current) {
      window.clearTimeout(beautyAnimationRef.current);
      beautyAnimationRef.current = null;
    }
    if (mode === "off") {
      stopBeauty();
      return srcTrack;
    }
    if (!srcTrack || isScreenSharingRef.current) {
      return srcTrack;
    }

    if (!beautyCanvasRef.current) beautyCanvasRef.current = document.createElement("canvas");
    const canvas = beautyCanvasRef.current;
    const initialSize = getInitialCanvasSize(srcTrack);
    resizeCanvasTo(canvas, initialSize.width, initialSize.height);
    let ctx = canvas.getContext("2d");
    if (!ctx) return srcTrack;

    if (!beautyVideoRef.current) {
      beautyVideoRef.current = document.createElement("video");
      beautyVideoRef.current.autoplay = true;
      beautyVideoRef.current.playsInline = true;
      beautyVideoRef.current.muted = true;
      beautyVideoRef.current.style.position = "absolute";
      beautyVideoRef.current.style.opacity = "0.01";
      beautyVideoRef.current.style.pointerEvents = "none";
      beautyVideoRef.current.style.width = "1px";
      beautyVideoRef.current.style.height = "1px";
      beautyVideoRef.current.style.transform = "translate3d(-9999px, -9999px, 0)";
      document.body.appendChild(beautyVideoRef.current);
    }
    const hiddenVideo = beautyVideoRef.current;
    
    const currentStream = hiddenVideo.srcObject as MediaStream | null;
    if (!currentStream || currentStream.getVideoTracks()[0] !== srcTrack) {
        hiddenVideo.srcObject = new MediaStream([srcTrack]);
    }

    let isPlaying = false;
    const startBeautyFilter = () => {
        if (hiddenVideo.videoWidth) resizeCanvasTo(canvas, hiddenVideo.videoWidth, hiddenVideo.videoHeight);
        hiddenVideo.play().then(() => { isPlaying = true; }).catch(console.error);
        
        const drawLoop = () => {
            if (isPlaying && hiddenVideo.videoWidth > 0 && hiddenVideo.videoHeight > 0) {
                drawBeautyFrame(mode, hiddenVideo, canvas, ctx!);
            }
            beautyAnimationRef.current = window.setTimeout(drawLoop, 33);
        };
        drawLoop();
    };

    if (hiddenVideo.readyState >= 2) { // HAVE_CURRENT_DATA
        startBeautyFilter();
    } else {
        hiddenVideo.onloadedmetadata = startBeautyFilter;
    }

    if (!beautyStreamRef.current || !beautyTrackRef.current || beautyTrackRef.current.readyState === 'ended') {
        try {
            const captureStream = canvas.captureStream || (canvas as any).mozCaptureStream;
            if (captureStream) {
                beautyStreamRef.current = captureStream.call(canvas, 30);
                beautyTrackRef.current = beautyStreamRef.current!.getVideoTracks()[0];
            } else {
                throw new Error("captureStream not supported");
            }
        } catch (e) {
            console.warn("Canvas captureStream unavailable; using visual-only mobile filter fallback", e);
            return srcTrack;
        }
    }
    
    return beautyTrackRef.current || srcTrack;
  };

  const buildPreviewStream = (
    videoTrack: MediaStreamTrack | null,
    audioTracks: MediaStreamTrack[] = localStreamRef.current?.getAudioTracks() || [],
  ) => {
    const previewTracks = [...audioTracks, ...(videoTrack ? [videoTrack] : [])];
    const previewStream = new MediaStream(previewTracks);
    localStreamRef.current = previewStream;
    setLocalStream(previewStream);
    if (localVideoRef.current) localVideoRef.current.srcObject = previewStream;
    return previewStream;
  };

  const refreshVideoInputs = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      const microphones = devices.filter((device) => device.kind === "audioinput");
      
      const uniqueCameras: MediaDeviceInfo[] = [];
      const seenIds = new Set<string>();
      for (const cam of cameras) {
          if (cam.deviceId && !seenIds.has(cam.deviceId)) {
              seenIds.add(cam.deviceId);
              uniqueCameras.push(cam);
          }
      }
      // If none had deviceId (e.g. permission not granted), fallback to all cameras
      const finalCameras = uniqueCameras.length > 0 ? uniqueCameras : cameras;
      
      setVideoInputs(finalCameras);
      if (!selectedVideoDeviceId && finalCameras[0]?.deviceId) {
        setSelectedVideoDeviceId(finalCameras[0].deviceId);
      }
      setAudioInputs(microphones);
      if (!selectedAudioDeviceId && microphones[0]?.deviceId) {
        setSelectedAudioDeviceId(microphones[0].deviceId);
      }
    } catch (err) {
      console.error("Could not enumerate media devices", err);
    }
  };

  const startStatsMonitor = (pc: RTCPeerConnection, call: CallData) => {
    stopStatsMonitor();
    statsIntervalRef.current = window.setInterval(async () => {
      try {
        const report = await pc.getStats();
        let rttMs: number | undefined;
        let jitterMs: number | undefined;
        let packetsLost = 0;
        let packetsReceived = 0;
        let outboundBytes: number | undefined;
        let outboundTimestamp: number | undefined;

        report.forEach((stat: any) => {
          if (stat.type === "candidate-pair" && stat.state === "succeeded") {
            if (typeof stat.currentRoundTripTime === "number") {
              rttMs = Math.round(stat.currentRoundTripTime * 1000);
            }
          }
          if (stat.type === "inbound-rtp" && !stat.isRemote) {
            if (typeof stat.jitter === "number") {
              jitterMs = Math.round(stat.jitter * 1000);
            }
            packetsLost += stat.packetsLost || 0;
            packetsReceived += stat.packetsReceived || 0;
          }
          if (stat.type === "outbound-rtp" && !stat.isRemote) {
            outboundBytes = (outboundBytes || 0) + (stat.bytesSent || 0);
            outboundTimestamp = stat.timestamp;
          }
        });

        let bitrateKbps: number | undefined;
        if (outboundBytes !== undefined && outboundTimestamp !== undefined) {
          const previous = previousOutboundStatsRef.current;
          if (previous && outboundTimestamp > previous.timestamp) {
            bitrateKbps = Math.max(
              0,
              Math.round(((outboundBytes - previous.bytes) * 8) / (outboundTimestamp - previous.timestamp)),
            );
          }
          previousOutboundStatsRef.current = {
            bytes: outboundBytes,
            timestamp: outboundTimestamp,
          };
        }

        const totalPackets = packetsLost + packetsReceived;
        const packetLossPercent = totalPackets
          ? Math.round((packetsLost / totalPackets) * 1000) / 10
          : undefined;
        const label: CallQualityStats["label"] =
          (packetLossPercent ?? 0) > 8 || (rttMs ?? 0) > 450
            ? "poor"
            : (packetLossPercent ?? 0) > 3 || (rttMs ?? 0) > 220
              ? "fair"
              : "good";
        const nextStats: CallQualityStats = {
          label,
          rttMs,
          jitterMs,
          packetLossPercent,
          bitrateKbps,
          updatedAt: Date.now(),
        };
        setCallQuality(nextStats);
        const signal = buildSignal(call);
        if (signal) emitSignal("call:stats", { ...signal, stats: nextStats });
      } catch (err) {
        console.warn("Could not read WebRTC stats", err);
      }
    }, 2500);
  };

  const attachPeerHandlers = (pc: RTCPeerConnection, call: CallData) => {
    const markConnected = () => {
      if (!connectedAtRef.current) connectedAtRef.current = Date.now();
      setCallStatus("connected");
      startStatsMonitor(pc, call);
      const signal = buildSignal(call);
      if (signal) emitSignal("call:connected", signal);
    };

    const markReconnecting = () => {
      setCallStatus("reconnecting");
    };

    const markFailed = () => {
      const signal = buildSignal(call);
      if (signal) emitSignal("call:failed", { ...signal, reason: "network_lost" });
      finishAfterStatus("failed", "Call failed");
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      if (minimizedRemoteVideoRef.current) minimizedRemoteVideoRef.current.srcObject = stream;
    };

    pc.onicecandidate = (event) => {
      const signal = buildSignal(call);
      if (event.candidate && signal) {
        emitSignal("call:ice-candidate", {
          ...signal,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        markConnected();
      } else if (pc.connectionState === "disconnected") {
        markReconnecting();
      } else if (pc.connectionState === "failed") {
        markFailed();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed"
      ) {
        markConnected();
      } else if (pc.iceConnectionState === "disconnected") {
        markReconnecting();
      } else if (pc.iceConnectionState === "failed") {
        markFailed();
      }
    };
  };

  const flushGroupIceCandidates = async (peerId: string) => {
    const pc = groupPeerConnectionsRef.current.get(peerId);
    if (!pc?.remoteDescription) return;
    const queued = groupPendingIceRef.current.get(peerId);
    if (!queued?.length) return;
    groupPendingIceRef.current.delete(peerId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Failed to add group ICE candidate", err);
      }
    }
  };

  const createGroupPeerConnection = (peerId: string, room: CallRoom) => {
    const existing = groupPeerConnectionsRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(getIceConfiguration());
    groupPeerConnectionsRef.current.set(peerId, pc);

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current as MediaStream);
    });

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      setGroupRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socket) return;
      socket.emit("call:room-ice-candidate", {
        roomId: room.id,
        fromUserId: currentUser.id,
        toUserId: peerId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        groupPeerConnectionsRef.current.delete(peerId);
        setGroupRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    };

    return pc;
  };

  const connectGroupMesh = async (room: CallRoom) => {
    if (!socket || !localStreamRef.current || room.status === "ended") return;
    for (const peerId of room.participantIds) {
      if (peerId === currentUser.id) continue;
      if (groupPeerConnectionsRef.current.has(peerId)) continue;
      const pc = createGroupPeerConnection(peerId, room);
      if (currentUser.id < peerId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:room-offer", {
          roomId: room.id,
          fromUserId: currentUser.id,
          toUserId: peerId,
          offer,
        });
      }
    }
  };

  const startNoAnswerTimeout = (call: CallData) => {
    const noticeId = window.setTimeout(() => {
      if (
        activeCallRef.current?.callId === call.callId &&
        callStatusRef.current === "outgoing_calling"
      ) {
        setCallStatus("trying_to_reach");
      }
    }, 10000);

    const missedId = window.setTimeout(() => {
      const currentCall = activeCallRef.current;
      const status = callStatusRef.current;
      if (
        currentCall?.callId === call.callId &&
        (status === "outgoing_calling" ||
          status === "trying_to_reach" ||
          status === "outgoing_ringing")
      ) {
        emitSignal("call:missed", {
          callId: call.callId,
          chatId: call.chatId,
          fromUserId: call.callerId,
          toUserId: call.calleeId,
          reason: "no_answer",
        });
        finishAfterStatus("missed", "No answer");
      }
    }, 30000);

    timeoutRefs.current.push(noticeId, missedId);
  };

  const startIncomingTimeout = (call: CallData) => {
    const timeoutId = window.setTimeout(() => {
      if (incomingCallRef.current?.callId !== call.callId) return;
      setIncomingCall(null);
      setCallStatus("idle");
    }, 30000);
    timeoutRefs.current.push(timeoutId);
  };

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: CallData & SignalPayload) => {
      if (data.toUserId && data.toUserId !== currentUser.id) return;
      if (data.callerId === currentUser.id) return;

      if (activeCallRef.current || incomingCallRef.current) {
        emitSignal("call:busy", {
          callId: data.callId,
          chatId: data.chatId,
          fromUserId: currentUser.id,
          toUserId: data.callerId,
          reason: "busy",
        });
        return;
      }

      const pendingOffer = pendingOffersRef.current.get(data.callId);
      const call = { ...data, offer: pendingOffer?.offer, status: "incoming_ringing" as CallStatus };
      peerUserIdRef.current = data.callerId;
      setIncomingCall(call);
      setCallStatus("incoming_ringing");
      emitSignal("call:ringing", {
        callId: data.callId,
        chatId: data.chatId,
        fromUserId: currentUser.id,
        toUserId: data.callerId,
      });
      startIncomingTimeout(call);
    };

    const handleOffer = (data: SignalPayload) => {
      if (!data.callId || !data.chatId || !data.fromUserId || !data.toUserId) return;
      if (data.toUserId !== currentUser.id || !data.offer) return;

      pendingOffersRef.current.set(data.callId, data);
      setIncomingCall((prev) =>
        prev?.callId === data.callId ? { ...prev, offer: data.offer } : prev,
      );
    };

    const handleCallAnswer = async (data: SignalPayload) => {
      if (!data.callId || data.toUserId !== currentUser.id || !data.answer) return;
      try {
        if (pcRef.current && pcRef.current.signalingState !== "stable") {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer),
          );
          await flushQueuedIceCandidates(data.callId);
        }
        setCallStatus("connecting");
      } catch (err) {
        console.error(err);
      }
    };

    const handleIceCandidate = async (data: SignalPayload) => {
      if (data.toUserId !== currentUser.id || !data.candidate) return;
      if (!pcRef.current || !pcRef.current.remoteDescription) {
        queueIceCandidate(data.callId, data.candidate);
        return;
      }
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error(err);
      }
    };

    const handleRinging = (data: SignalPayload) => {
      if (data.toUserId !== currentUser.id) return;
      setCallStatus("outgoing_ringing");
    };

    const handleAccepted = (data: SignalPayload) => {
      if (data.toUserId !== currentUser.id) return;
      setCallStatus("connecting");
    };

    const handleConnected = (data: SignalPayload) => {
      if (data.toUserId !== currentUser.id) return;
      if (!connectedAtRef.current) connectedAtRef.current = Date.now();
      setCallStatus("connected");
    };

    const isCurrentCallEvent = (data?: SignalPayload) => {
      if (!data?.callId) return true;
      return (
        activeCallRef.current?.callId === data.callId ||
        incomingCallRef.current?.callId === data.callId
      );
    };

    const endFromRemote = (status: CallStatus, message?: string, data?: SignalPayload) => {
      if (!isCurrentCallEvent(data)) return;
      const finalStatus =
        data?.reason === "ended_by_caller" || data?.reason === "cancelled"
          ? "cancelled"
          : status;
      finishAfterStatus(finalStatus, message);
    };

    const handleRemoteScreenStarted = (data: SignalPayload) => {
      if (!isCurrentCallEvent(data) || data.toUserId !== currentUser.id) return;
      setRemoteScreenSharing(true);
    };

    const handleRemoteScreenStopped = (data: SignalPayload) => {
      if (!isCurrentCallEvent(data) || data.toUserId !== currentUser.id) return;
      setRemoteScreenSharing(false);
    };

    const handleMediaState = (data: SignalPayload) => {
      if (!isCurrentCallEvent(data) || data.toUserId !== currentUser.id) return;
      if (typeof data.screenSharing === "boolean") {
        setRemoteScreenSharing(data.screenSharing);
      }
      if (data.quality) setRemoteQuality(data.quality);
      if (data.beautyMode) setRemoteBeautyMode(data.beautyMode);
    };

    const handleDisconnect = () => {
      if (!activeCallRef.current) return;
      setCallStatus("reconnecting");
      reconnectTimeoutRef.current = window.setTimeout(() => {
        const call = activeCallRef.current;
        if (!call) return;
        const signal = buildSignal(call);
        if (signal) emitSignal("call:end", { ...signal, reason: "network_lost" });
        finishAfterStatus("failed", "Connection lost");
      }, 10000);
    };

    const handleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (activeCallRef.current && callStatusRef.current === "reconnecting") {
        setCallStatus(connectedAtRef.current ? "connected" : "connecting");
      }
    };

    const startOutgoingCall = async (e: Event) => {
      const { chatId, calleeId, calleeName, calleeAvatar, isVideo } = (
        e as CustomEvent<StartCallDetail>
      ).detail;

      if (!calleeId) {
        setHasError("Select a direct chat before starting a call.");
        window.setTimeout(() => setHasError(""), 3000);
        return;
      }

      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setHasError(
          "Camera and microphone require HTTPS on mobile browsers. Use Tailscale Serve HTTPS URL.",
        );
        window.setTimeout(() => setHasError(""), 5000);
        return;
      }

      const baseCall = {
        chatId,
        callerId: currentUser.id,
        callerName: currentUser.name,
        callerAvatar: currentUser.avatar,
        calleeId,
        calleeName,
        calleeAvatar,
        isVideo,
      };

      try {
        const callId = await createCallLog(baseCall);
        const call: CallData = { ...baseCall, callId, status: "outgoing_calling" };
        peerUserIdRef.current = calleeId;
        setActiveCall(call);
        setIsMinimized(false);
        setCallStatus("outgoing_calling");

        const pc = new RTCPeerConnection(getIceConfiguration());
        pcRef.current = pc;
        
        const { stream: obtainedStream, quality: obtainedQuality } = await getCameraStreamWithFallback(isVideo, videoQuality);
        const cameraTrack = obtainedStream.getVideoTracks()[0] || null;
        localStreamRef.current = obtainedStream;
        cameraVideoTrackRef.current = cameraTrack;
        setVideoQuality(obtainedQuality);
        
        const finalVideoTrack = applyBeautyMode(beautyMode, cameraTrack);
        const audioTracks = obtainedStream.getAudioTracks();
        
        buildPreviewStream(finalVideoTrack || cameraTrack, audioTracks);
        void refreshVideoInputs();

        audioTracks.forEach((track) => pc.addTrack(track, obtainedStream));
        if (finalVideoTrack) {
           const sender = pc.addTrack(finalVideoTrack, obtainedStream);
           tuneVideoSender(sender, obtainedQuality);
        }

        attachPeerHandlers(pc, call);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const signal = {
          callId,
          chatId,
          fromUserId: currentUser.id,
          toUserId: calleeId,
        };
        socket.emit("call:start", { ...call, ...signal });
        socket.emit("call:offer", { ...signal, offer });
        startNoAnswerTimeout(call);
      } catch (err) {
        console.error("Failed to start call", err);
        setHasError(
          "Could not access camera/microphone. Please ensure permissions are granted.",
        );
        resetState();
      }
    };

    const startGroupCall = async (e: Event) => {
      const { chatId, chatName, participantIds, isVideo } = (
        e as CustomEvent<StartGroupCallDetail>
      ).detail;
      const invitedIds = Array.from(new Set(participantIds)).filter(
        (id) => id && id !== currentUser.id,
      );

      if (invitedIds.length > 3) {
        setHasError("Group calls are limited to 4 participants in this mesh version.");
        window.setTimeout(() => setHasError(""), 4000);
        return;
      }
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setHasError("Camera and microphone require HTTPS on mobile browsers.");
        window.setTimeout(() => setHasError(""), 5000);
        return;
      }

      try {
        const res = await fetch(`${window.location.origin}/api/call-rooms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            hostId: currentUser.id,
            participantIds: invitedIds,
            type: isVideo ? "video" : "audio",
          }),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.error || "Could not create group call");
        }
        const room = (await res.json()) as CallRoom & { callId?: string };
        setActiveGroupRoom(room);
        setGroupParticipantStates({
          [currentUser.id]: {
            audioMuted: isMuted,
            videoOff: !isVideo || isVideoOff,
            screenSharing: false,
            quality: videoQuality,
            beautyMode,
          },
        });
        setCallStatus("connected");
        setIsMinimized(false);
        socket.emit("call:room-created", {
          room,
          chatName,
          fromUserId: currentUser.id,
          participantIds: room.participantIds,
        });

        const { stream: obtainedStream, quality: obtainedQuality } =
          await getCameraStreamWithFallback(isVideo, videoQuality);
        const cameraTrack = obtainedStream.getVideoTracks()[0] || null;
        localStreamRef.current = obtainedStream;
        cameraVideoTrackRef.current = cameraTrack;
        setVideoQuality(obtainedQuality);
        buildPreviewStream(applyBeautyMode(beautyMode, cameraTrack) || cameraTrack, obtainedStream.getAudioTracks());
        void refreshVideoInputs();
        void connectGroupMesh(room);
      } catch (err) {
        console.error(err);
        setHasError(err instanceof Error ? err.message : "Could not start group call.");
        window.setTimeout(() => setHasError(""), 4000);
      }
    };

    const handleRoomCreated = (data: {
      room?: CallRoom;
      chatName?: string;
      fromUserId?: string;
      participantIds?: string[];
    }) => {
      const room = data.room;
      if (!room || data.fromUserId === currentUser.id) return;
      if (!room.participantIds.includes(currentUser.id)) return;
      if (activeCallRef.current || activeGroupRoomRef.current) {
        socket.emit("call:room-leave", {
          roomId: room.id,
          userId: currentUser.id,
          reason: "busy",
        });
        return;
      }
      setActiveGroupRoom(room);
      setCallStatus("incoming_ringing");
      setHasError(`Incoming group ${room.type} call${data.chatName ? ` in ${data.chatName}` : ""}`);
      window.setTimeout(() => setHasError(""), 4000);
    };

    const handleRoomJoin = (data: { roomId?: string; userId?: string }) => {
      if (!data.roomId || activeGroupRoomRef.current?.id !== data.roomId || !data.userId) return;
      setActiveGroupRoom((prev) =>
        prev
          ? {
              ...prev,
              status: "active",
              participantIds: Array.from(new Set([...prev.participantIds, data.userId!])),
            }
          : prev,
      );
      const room = activeGroupRoomRef.current;
      if (room) {
        void connectGroupMesh({
          ...room,
          status: "active",
          participantIds: Array.from(new Set([...room.participantIds, data.userId])),
        });
      }
    };

    const handleRoomLeave = (data: { roomId?: string; userId?: string; ended?: boolean }) => {
      if (!data.roomId || activeGroupRoomRef.current?.id !== data.roomId) return;
      if (data.ended) {
        finishAfterStatus("ended", "Group call ended");
        return;
      }
      if (data.userId) {
        groupPeerConnectionsRef.current.get(data.userId)?.close();
        groupPeerConnectionsRef.current.delete(data.userId);
        setGroupRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[data.userId!];
          return next;
        });
      }
      setActiveGroupRoom((prev) =>
        prev
          ? {
              ...prev,
              participantIds: prev.participantIds.filter((id) => id !== data.userId),
            }
          : prev,
      );
    };

    const handleParticipantState = (data: {
      roomId?: string;
      userId?: string;
      mediaState?: CallMediaState;
    }) => {
      if (
        !data.roomId ||
        activeGroupRoomRef.current?.id !== data.roomId ||
        !data.userId ||
        !data.mediaState
      ) {
        return;
      }
      setGroupParticipantStates((prev) => ({
        ...prev,
        [data.userId!]: data.mediaState!,
      }));
    };

    const handleRoomOffer = async (data: SignalPayload & { roomId?: string }) => {
      const room = activeGroupRoomRef.current;
      if (!room || data.roomId !== room.id || data.toUserId !== currentUser.id || !data.offer) return;
      try {
        const pc = createGroupPeerConnection(data.fromUserId, room);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushGroupIceCandidates(data.fromUserId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call:room-answer", {
          roomId: room.id,
          fromUserId: currentUser.id,
          toUserId: data.fromUserId,
          answer,
        });
      } catch (err) {
        console.error("Could not answer group offer", err);
      }
    };

    const handleRoomAnswer = async (data: SignalPayload & { roomId?: string }) => {
      const room = activeGroupRoomRef.current;
      if (!room || data.roomId !== room.id || data.toUserId !== currentUser.id || !data.answer) return;
      const pc = groupPeerConnectionsRef.current.get(data.fromUserId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushGroupIceCandidates(data.fromUserId);
      } catch (err) {
        console.error("Could not apply group answer", err);
      }
    };

    const handleRoomIceCandidate = async (data: SignalPayload & { roomId?: string }) => {
      const room = activeGroupRoomRef.current;
      if (!room || data.roomId !== room.id || data.toUserId !== currentUser.id || !data.candidate) return;
      const pc = groupPeerConnectionsRef.current.get(data.fromUserId);
      if (!pc || !pc.remoteDescription) {
        const queued = groupPendingIceRef.current.get(data.fromUserId) || [];
        queued.push(data.candidate);
        groupPendingIceRef.current.set(data.fromUserId, queued);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error("Could not add group ICE candidate", err);
      }
    };

    window.addEventListener("START_CALL", startOutgoingCall);
    window.addEventListener("START_GROUP_CALL", startGroupCall);
    socket.on("call:start", handleIncomingCall);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleCallAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);
    socket.on("call:ringing", handleRinging);
    socket.on("call:accepted", handleAccepted);
    socket.on("call:connected", handleConnected);
    socket.on("call:screen-share-started", handleRemoteScreenStarted);
    socket.on("call:screen-share-stopped", handleRemoteScreenStopped);
    socket.on("call:media-state", handleMediaState);
    socket.on("call:room-created", handleRoomCreated);
    socket.on("call:room-join", handleRoomJoin);
    socket.on("call:room-leave", handleRoomLeave);
    socket.on("call:participant-state", handleParticipantState);
    socket.on("call:room-offer", handleRoomOffer);
    socket.on("call:room-answer", handleRoomAnswer);
    socket.on("call:room-ice-candidate", handleRoomIceCandidate);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleReconnect);
    socket.on("call:busy", (data) => endFromRemote("busy", "User busy", data));
    socket.on("call:missed", (data) => endFromRemote("missed", "No answer", data));
    socket.on("call:unavailable", (data) =>
      endFromRemote("unavailable", "User unavailable", data),
    );
    socket.on("call:declined", (data) =>
      endFromRemote("declined", "Call declined", data),
    );
    socket.on("call:ended", (data) => endFromRemote("ended", undefined, data));
    socket.on("call:failed", (data) => endFromRemote("failed", "Call failed", data));

    return () => {
      window.removeEventListener("START_CALL", startOutgoingCall);
      window.removeEventListener("START_GROUP_CALL", startGroupCall);
      socket.off("call:start", handleIncomingCall);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleCallAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
      socket.off("call:ringing", handleRinging);
      socket.off("call:accepted", handleAccepted);
      socket.off("call:connected", handleConnected);
      socket.off("call:screen-share-started", handleRemoteScreenStarted);
      socket.off("call:screen-share-stopped", handleRemoteScreenStopped);
      socket.off("call:media-state", handleMediaState);
      socket.off("call:room-created", handleRoomCreated);
      socket.off("call:room-join", handleRoomJoin);
      socket.off("call:room-leave", handleRoomLeave);
      socket.off("call:participant-state", handleParticipantState);
      socket.off("call:room-offer", handleRoomOffer);
      socket.off("call:room-answer", handleRoomAnswer);
      socket.off("call:room-ice-candidate", handleRoomIceCandidate);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleReconnect);
      socket.off("call:busy");
      socket.off("call:missed");
      socket.off("call:unavailable");
      socket.off("call:declined");
      socket.off("call:ended");
      socket.off("call:failed");
    };
  }, [socket, currentUser]);

  useEffect(() => {
    let interval: number | undefined;
    if (activeCall && callStatus === "connected") {
      interval = window.setInterval(() => setCallDuration((duration) => duration + 1), 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [activeCall, callStatus]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (minimizedRemoteVideoRef.current && remoteStream) {
      minimizedRemoteVideoRef.current.srcObject = remoteStream;
    }
  }, [activeCall, isMinimized, isVideoOff, localStream, remoteStream]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const call = activeCallRef.current;
      if (!call) return;
      const signal = buildSignal(call);
      if (signal) {
        socket?.emit("call:end", {
          ...signal,
          reason: connectedAtRef.current ? "network_lost" : "ended_by_caller",
        });
      }
      stopTracks(screenStreamRef.current);
      stopTracks(localStreamRef.current);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [socket, currentUser.id]);

  const acceptCall = async () => {
    if (!socket || !incomingCall) return;

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setHasError(
        "Camera and microphone require HTTPS on mobile browsers. Use Tailscale Serve HTTPS URL.",
      );
      window.setTimeout(() => {
        setHasError("");
        declineCall();
      }, 3000);
      return;
    }

    const offerData = getIncomingOffer(incomingCall);
    if (!offerData) {
      setHasError("Preparing call. Please wait...");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }

    clearTimers();
    peerUserIdRef.current = offerData.fromUserId;
    setActiveCall(incomingCall);
    setIncomingCall(null);
    setIsMinimized(false);
    setCallStatus("connecting");

    try {
      emitSignal("call:accepted", {
        callId: incomingCall.callId,
        chatId: incomingCall.chatId,
        fromUserId: currentUser.id,
        toUserId: offerData.fromUserId,
      });

      const pc = new RTCPeerConnection(getIceConfiguration());
      pcRef.current = pc;

      const { stream: obtainedStream, quality: obtainedQuality } = await getCameraStreamWithFallback(incomingCall.isVideo, videoQuality);
      const cameraTrack = obtainedStream.getVideoTracks()[0] || null;
      localStreamRef.current = obtainedStream;
      cameraVideoTrackRef.current = cameraTrack;
      setVideoQuality(obtainedQuality);
      
      const finalVideoTrack = applyBeautyMode(beautyMode, cameraTrack);
      const audioTracks = obtainedStream.getAudioTracks();

      buildPreviewStream(finalVideoTrack || cameraTrack, audioTracks);
      void refreshVideoInputs();

      audioTracks.forEach((track) => pc.addTrack(track, obtainedStream));
      if (finalVideoTrack) {
         const sender = pc.addTrack(finalVideoTrack, obtainedStream);
         tuneVideoSender(sender, obtainedQuality);
      }

      attachPeerHandlers(pc, incomingCall);

      await pc.setRemoteDescription(new RTCSessionDescription(offerData.offer));
      await flushQueuedIceCandidates(incomingCall.callId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emitSignal("call:answer", {
        callId: incomingCall.callId,
        chatId: incomingCall.chatId,
        fromUserId: currentUser.id,
        toUserId: offerData.fromUserId,
        answer,
      });
    } catch (err) {
      console.error(err);
      const signal = buildSignal(incomingCall, offerData.fromUserId);
      if (signal) emitSignal("call:failed", { ...signal, reason: "failed" });
      finishAfterStatus("failed", "Call failed");
    }
  };

  const declineCall = () => {
    if (!incomingCall) return;
    emitSignal("call:declined", {
      callId: incomingCall.callId,
      chatId: incomingCall.chatId,
      fromUserId: currentUser.id,
      toUserId: incomingCall.callerId,
      reason: "declined",
    });
    finishAfterStatus("idle", "Call declined");
  };

  const endActiveCall = () => {
    if (!activeCall) return;
    const signal = buildSignal(activeCall);
    if (signal) {
      emitSignal("call:end", {
        ...signal,
        reason: connectedAtRef.current ? "ended" : "ended_by_caller",
      });
    }
    finishAfterStatus("ended", "Call ended");
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const nextMuted = !audioTrack.enabled;
      setIsMuted(nextMuted);
      emitMediaState(nextMuted, isVideoOff, isScreenSharing);
      emitGroupMediaState(nextMuted, isVideoOff, isScreenSharing);
    }
  };

  const toggleVideo = () => {
    const videoTrack = cameraVideoTrackRef.current || localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const nextVideoOff = !videoTrack.enabled;
      setIsVideoOff(nextVideoOff);
      emitMediaState(isMuted, nextVideoOff, isScreenSharing);
      emitGroupMediaState(isMuted, nextVideoOff, isScreenSharing);
    }
  };

  const findVideoSender = () =>
    pcRef.current?.getSenders().find((sender) => sender.track?.kind === "video");

  const startScreenShare = async () => {
    if (!activeCall?.isVideo) return;
    if (!featureSupport.screenShare) {
      setHasError("Screen sharing is not supported on this browser.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }
    
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const screenVideoTrack = displayStream.getVideoTracks()[0];
      if (!screenVideoTrack) {
        stopTracks(displayStream);
        setHasError("No screen video track was selected.");
        window.setTimeout(() => setHasError(""), 3500);
        return;
      }

      cameraVideoTrackRef.current =
        cameraVideoTrackRef.current || localStreamRef.current?.getVideoTracks()[0] || null;

      const sender = findVideoSender();
      if (sender) {
        await sender.replaceTrack(screenVideoTrack);
        tuneVideoSender(sender, "1080p");
      } else if (pcRef.current) {
        const sender2 = pcRef.current.addTrack(screenVideoTrack, displayStream);
        tuneVideoSender(sender2, "1080p");
      }

      stopTracks(screenStreamRef.current);
      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);
      setLocalStream(displayStream);
      setIsScreenSharing(true);
      emitForActiveCall("call:screen-share-started");
      emitMediaState(isMuted, isVideoOff, true);
      screenVideoTrack.onended = () => {
        void stopScreenShare();
      };
    } catch (err) {
      console.error("Screen share failed", err);
      setHasError("Could not start screen sharing.");
      window.setTimeout(() => setHasError(""), 3500);
    }
  };

  const stopScreenShare = async () => {
    const call = activeCallRef.current;
    if (!call || !screenStreamRef.current) return;
    try {
      const cameraTrack = cameraVideoTrackRef.current;
      const sender = findVideoSender();
      if (sender && cameraTrack && !isVideoOff) {
        const trackToUse = applyBeautyMode(beautyMode, cameraTrack);
        await sender.replaceTrack(trackToUse);
        tuneVideoSender(sender, videoQuality);
      } else if (sender && isVideoOff) {
        await sender.replaceTrack(null);
      }
    } catch (err) {
      console.error("Could not restore camera after screen share", err);
    } finally {
      stopTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      setScreenStream(null);
      
      const originalCamTrack = cameraVideoTrackRef.current;
      const previewTrack = beautyMode !== "off" && originalCamTrack && !isVideoOff
        ? applyBeautyMode(beautyMode, originalCamTrack)
        : originalCamTrack;
      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      buildPreviewStream(previewTrack || originalCamTrack, audioTracks);
      setIsScreenSharing(false);
      emitForActiveCall("call:screen-share-stopped");
      emitMediaState(isMuted, isVideoOff, false);
    }
  };

  const switchCamera = async () => {
    if (!activeCall?.isVideo || videoInputs.length < 2) return;
    const currentIndex = Math.max(
      0,
      videoInputs.findIndex((device) => device.deviceId === selectedVideoDeviceId),
    );
    const nextDevice = videoInputs[(currentIndex + 1) % videoInputs.length];
    if (!nextDevice) return;

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId }, ...getVideoConstraints(videoQuality) as any },
        audio: false,
      });
      const nextTrack = nextStream.getVideoTracks()[0];
      if (!nextTrack) {
        stopTracks(nextStream);
        return;
      }

      const oldVideoTrack = cameraVideoTrackRef.current || localStreamRef.current?.getVideoTracks()[0];
      cameraVideoTrackRef.current = nextTrack;
      setSelectedVideoDeviceId(nextDevice.deviceId);

      const trackToUse = applyBeautyMode(beautyMode, nextTrack);

      if (!isScreenSharing) {
        const sender = findVideoSender();
        if (sender) {
            await sender.replaceTrack(trackToUse);
            tuneVideoSender(sender, videoQuality);
        }
      }

      // Preserve audio config if possible, but fallback is ok
      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      if (!isScreenSharing) buildPreviewStream(trackToUse || nextTrack, audioTracks);
      oldVideoTrack?.stop();
    } catch (err) {
      console.error("Could not switch camera", err);
      setHasError("Could not switch camera.");
      window.setTimeout(() => setHasError(""), 3000);
    }
  };

  const switchCameraConfig = async (newQuality: "auto" | "720p" | "1080p" | "2k") => {
      try {
          const { stream: newStream, quality: obtainedQuality } = await getCameraStreamWithFallback(true, newQuality);
          const newCameraTrack = newStream.getVideoTracks()[0];
          if (!newCameraTrack) return;
          
          const oldCameraTrack = cameraVideoTrackRef.current;
          cameraVideoTrackRef.current = newCameraTrack;
          setVideoQuality(obtainedQuality);
          
          const trackToUse = applyBeautyMode(beautyMode, newCameraTrack);
          
          if (!isScreenSharing) {
              const sender = findVideoSender();
              if (sender) {
                  await sender.replaceTrack(trackToUse);
                  tuneVideoSender(sender, obtainedQuality);
              }
          }
          
          const audioTracks = localStreamRef.current?.getAudioTracks() || [];
          if (!isScreenSharing) buildPreviewStream(trackToUse || newCameraTrack, audioTracks);
          
          oldCameraTrack?.stop();
          emitMediaState(isMuted, isVideoOff, isScreenSharing, obtainedQuality, beautyMode);
      } catch(err) {
          console.error(err);
          setHasError("Could not change video quality");
          setTimeout(() => setHasError(""), 3000);
      }
  };

  const changeBeautyMode = async (newMode: BeautyMode) => {
      setBeautyMode(newMode);
      if (!cameraVideoTrackRef.current) return;
      
      const trackToUse = applyBeautyMode(newMode, cameraVideoTrackRef.current);
      buildPreviewStream(trackToUse || cameraVideoTrackRef.current);
      
      if (!isScreenSharing) {
          const sender = findVideoSender();
          if (sender) await sender.replaceTrack(trackToUse);
      }
      
      emitMediaState(isMuted, isVideoOff, isScreenSharing, videoQuality, newMode);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen failed", err);
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (remoteVideoRef.current && document.pictureInPictureEnabled && !remoteVideoRef.current.disablePictureInPicture) {
        await remoteVideoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error(err);
      setHasError("Picture-in-Picture is not supported or was blocked");
      setTimeout(() => setHasError(""), 3000);
    }
  };

  const joinGroupRoom = async () => {
    if (!activeGroupRoom || !socket) return;
    if (activeGroupRoom.participantIds.length >= activeGroupRoom.maxParticipants) {
      setHasError("This group call is full.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }
    try {
      const res = await fetch(
        `${window.location.origin}/api/call-rooms/${activeGroupRoom.id}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser.id }),
        },
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Could not join group call");
      }
      const room = (await res.json()) as CallRoom;
      setActiveGroupRoom(room);
      setCallStatus("connected");
      socket.emit("call:room-join", {
        roomId: room.id,
        fromUserId: currentUser.id,
        userId: currentUser.id,
        participantIds: room.participantIds,
      });

      const { stream: obtainedStream, quality: obtainedQuality } =
        await getCameraStreamWithFallback(room.type === "video", videoQuality);
      const cameraTrack = obtainedStream.getVideoTracks()[0] || null;
      localStreamRef.current = obtainedStream;
      cameraVideoTrackRef.current = cameraTrack;
      setVideoQuality(obtainedQuality);
      buildPreviewStream(applyBeautyMode(beautyMode, cameraTrack) || cameraTrack, obtainedStream.getAudioTracks());
      void refreshVideoInputs();
      void connectGroupMesh(room);
    } catch (err) {
      console.error(err);
      setHasError(err instanceof Error ? err.message : "Could not join group call.");
      window.setTimeout(() => setHasError(""), 4000);
    }
  };

  const leaveGroupRoom = async (ended = false) => {
    const room = activeGroupRoomRef.current;
    if (!room) return;
    try {
      await fetch(`${window.location.origin}/api/call-rooms/${room.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, ended }),
      });
      socket?.emit("call:room-leave", {
        roomId: room.id,
        fromUserId: currentUser.id,
        userId: currentUser.id,
        ended,
      });
    } catch (err) {
      console.error(err);
    } finally {
      resetState();
    }
  };

  const emitGroupMediaState = (
    audioMuted = isMuted,
    videoOff = isVideoOff,
    screenSharing = isScreenSharing,
  ) => {
    const room = activeGroupRoomRef.current;
    if (!room || !socket) return;
    const mediaState: CallMediaState = {
      audioMuted,
      videoOff,
      screenSharing,
      quality: videoQuality,
      beautyMode,
    };
    setGroupParticipantStates((prev) => ({ ...prev, [currentUser.id]: mediaState }));
    socket.emit("call:participant-state", {
      roomId: room.id,
      fromUserId: currentUser.id,
      userId: currentUser.id,
      mediaState,
    });
  };

  const toggleCallRecording = () => {
    if (!featureSupport.recording) {
      setHasError("Local recording is not supported by this browser.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }
    if (isCallRecording) {
      stopCallRecording();
      return;
    }

    const tracks = [
      ...(remoteStreamRef.current?.getTracks() || []),
      ...(localStreamRef.current?.getAudioTracks() || []),
      ...(activeGroupRoomRef.current ? localStreamRef.current?.getVideoTracks() || [] : []),
    ];
    if (!tracks.length) {
      setHasError("No media tracks available to record yet.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }

    try {
      const recorder = new MediaRecorder(new MediaStream(tracks));
      callRecordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) callRecordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(callRecordingChunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        if (!blob.size) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `glasschat_call_${Date.now()}.webm`;
        anchor.click();
        URL.revokeObjectURL(url);
      };
      recorder.start(1000);
      callRecorderRef.current = recorder;
      setIsCallRecording(true);
    } catch (err) {
      console.error(err);
      setHasError("Could not start local recording.");
      window.setTimeout(() => setHasError(""), 3000);
    }
  };

  const takeSnapshot = () => {
    const source =
      remoteVideoRef.current?.videoWidth ? remoteVideoRef.current : localVideoRef.current;
    if (!source?.videoWidth || !source.videoHeight) {
      setHasError("No video frame is available for snapshot.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `glasschat_snapshot_${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const toggleCaptions = () => {
    if (!featureSupport.captions) {
      setHasError("Live captions are not supported by this browser.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }
    if (captionsEnabled) {
      stopCaptions();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: any;
      webkitSpeechRecognition?: any;
    };
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        const text = Array.from(event.results)
          .slice(-2)
          .map((result: any) => result[0]?.transcript || "")
          .join(" ")
          .trim();
        if (text) setCaptionText(text);
      };
      recognition.onerror = () => {
        setCaptionsEnabled(false);
      };
      recognition.onend = () => {
        if (captionRecognitionRef.current) {
          try {
            captionRecognitionRef.current.start();
          } catch {
            setCaptionsEnabled(false);
          }
        }
      };
      captionRecognitionRef.current = recognition;
      recognition.start();
      setCaptionsEnabled(true);
    } catch (err) {
      console.error(err);
      setHasError("Could not start live captions.");
      window.setTimeout(() => setHasError(""), 3000);
    }
  };

  const displayCall = activeCall || incomingCall;
  const isCaller = displayCall?.callerId === currentUser.id;
  const hasIncomingOffer = incomingCall ? !!getIncomingOffer(incomingCall) : false;
  const otherName = useMemo(() => {
    if (!displayCall) return "Call";
    return isCaller
      ? displayCall.calleeName || "Call"
      : displayCall.callerName || "Call";
  }, [displayCall, isCaller]);
  const otherAvatar = isCaller ? displayCall?.calleeAvatar : displayCall?.callerAvatar;
  const statusLabel =
    callStatus === "outgoing_calling"
      ? "Calling..."
      : callStatus === "trying_to_reach"
        ? "Trying to reach user..."
      : callStatus === "outgoing_ringing" || callStatus === "incoming_ringing"
        ? "Ringing..."
        : callStatus === "connecting"
          ? "Connecting..."
          : callStatus === "connected"
            ? formatDuration(callDuration)
            : callStatus === "reconnecting"
              ? "Reconnecting..."
              : callStatus === "busy"
                ? "User busy"
                : callStatus === "missed"
                  ? "No answer"
                  : callStatus === "declined"
                    ? "Call declined"
                    : callStatus === "unavailable"
                      ? "User unavailable"
                      : callStatus === "failed"
                        ? "Call failed"
                        : callStatus === "cancelled"
                          ? "Call cancelled"
                          : callStatus === "ended"
                            ? "Call ended"
                            : "";

  const renderAvatar = (sizeClass: string) => (
    <div className={cn("rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700 shadow-xl", sizeClass)}>
      {otherAvatar ? (
        <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-bold">{otherName.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );

  if (!incomingCall && !activeCall && !activeGroupRoom && !hasError) return null;

  if (activeCall && isMinimized) {
    const showMiniVideo = activeCall.isVideo && remoteStream?.getVideoTracks()[0]?.enabled;
    return (
      <AnimatePresence>
        {hasError && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg shadow-2xl z-50">
            <p className="font-bold text-sm">Call status</p>
            <p className="text-xs mt-1">{hasError}</p>
          </motion.div>
        )}
        <motion.div
          drag
          dragMomentum={false}
          whileDrag={{ scale: 1.05 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          role="button"
          tabIndex={0}
          onClick={() => setIsMinimized(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setIsMinimized(false);
          }}
          style={{ position: 'fixed', zIndex: 40, bottom: 20, right: 20 }}
          className={cn(
            "bg-slate-950/95 text-white shadow-2xl border border-slate-700 backdrop-blur-md cursor-pointer",
            activeCall.isVideo
              ? "w-48 h-32 sm:w-64 sm:h-40 rounded-xl overflow-hidden"
              : "w-80 rounded-full px-4 py-3",
          )}
        >
          {activeCall.isVideo ? (
            <>
              {showMiniVideo ? (
                <video
                  ref={minimizedRemoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  {renderAvatar("w-16 h-16 text-2xl")}
                </div>
              )}
              {remoteQuality && remoteQuality !== "auto" && showMiniVideo && (
                 <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] uppercase font-bold tracking-wider">{remoteQuality}</div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{otherName}</p>
                    <p className="text-[10px] text-emerald-300 font-mono flex items-center gap-1">
                      {statusLabel}
                      {remoteScreenSharing && <MonitorUp className="w-3 h-3 text-sky-400" />}
                    </p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      endActiveCall();
                    }}
                    className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center shrink-0"
                    title="End call"
                  >
                    <PhoneOff className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {renderAvatar("w-11 h-11 text-lg shrink-0")}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{otherName}</p>
                <p className="text-xs text-emerald-300 font-mono">{statusLabel}</p>
              </div>
              {isMuted && <MicOff className="w-4 h-4 text-amber-300 shrink-0" />}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  endActiveCall();
                }}
                className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center shrink-0"
                title="End call"
              >
                <PhoneOff className="w-5 h-5 text-white" />
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      {hasError && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-4 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg shadow-2xl z-50">
          <p className="font-bold text-sm">Call status</p>
          <p className="text-xs mt-1">{hasError}</p>
        </motion.div>
      )}

      {incomingCall && !activeCall && (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className="bg-slate-900 rounded-2xl p-8 flex flex-col items-center shadow-2xl w-[320px] border border-slate-700 mx-4 shadow-[0_0_40px_rgba(79,70,229,0.2)]">
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-4xl mb-6 shadow-inner relative overflow-hidden">
            <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20" />
            {otherAvatar ? (
              <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover relative z-10" />
            ) : (
              <span className="relative z-10 font-bold text-white">{otherName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <h2 className="text-white text-xl font-bold mb-2">
            Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call
          </h2>
          <p className="text-slate-400 mb-2">{otherName}</p>
          <p className="text-emerald-400 text-sm mb-8 font-mono">
            {hasIncomingOffer ? statusLabel : "Preparing call..."}
          </p>

          <div className="flex space-x-6">
            <button onClick={declineCall} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg hover:shadow-red-500/50">
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              onClick={acceptCall}
              disabled={!hasIncomingOffer}
              title={hasIncomingOffer ? "Accept call" : "Preparing call..."}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg",
                hasIncomingOffer
                  ? "bg-emerald-500 hover:bg-emerald-600 hover:scale-105 hover:shadow-emerald-500/50 animate-pulse"
                  : "bg-slate-600 cursor-not-allowed opacity-60",
              )}
            >
              {incomingCall.isVideo ? <VideoIcon className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </button>
          </div>
        </motion.div>
      )}

      {activeGroupRoom && !activeCall && !incomingCall && (
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className="w-full h-full md:w-[88%] md:h-[90%] md:max-w-6xl md:rounded-2xl bg-slate-950 flex flex-col shadow-2xl border border-slate-800 overflow-hidden"
        >
          <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-[0.2em]">
                <Users className="w-4 h-4" />
                Mesh group call
              </div>
              <h2 className="text-white text-xl sm:text-2xl font-bold truncate">
                {activeGroupRoom.type === "video" ? "Video" : "Audio"} room
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                {activeGroupRoom.participantIds.length}/{activeGroupRoom.maxParticipants}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700 capitalize">
                {callStatus === "incoming_ringing" ? "Invite" : activeGroupRoom.status}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">
            {activeGroupRoom.participantIds.map((participantId) => {
              const mediaState = groupParticipantStates[participantId];
              const isSelf = participantId === currentUser.id;
              const participantStream = groupRemoteStreams[participantId];
              const hasParticipantVideo =
                !!participantStream?.getVideoTracks().some((track) => track.enabled);
              return (
                <div
                  key={participantId}
                  className="relative min-h-[220px] rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center"
                >
                  {isSelf && activeGroupRoom.type === "video" && localStream && !isVideoOff ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ transform: "scaleX(-1)", filter: getBeautyCssFilter(beautyMode) }}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : !isSelf && activeGroupRoom.type === "video" && hasParticipantVideo ? (
                    <video
                      ref={(node) => {
                        if (node && node.srcObject !== participantStream) {
                          node.srcObject = participantStream;
                        }
                      }}
                      autoPlay
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-center">
                      <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-2xl font-bold mb-3">
                        {isSelf ? currentUser.name.charAt(0).toUpperCase() : participantId.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-white font-semibold">
                        {isSelf ? "You" : `Participant ${participantId.slice(0, 6)}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {mediaState?.videoOff ? "Camera off" : "Waiting for media"}
                      </p>
                    </div>
                  )}
                  {!isSelf && participantStream && (
                    <audio
                      ref={(node) => {
                        if (node && node.srcObject !== participantStream) {
                          node.srcObject = participantStream;
                        }
                      }}
                      autoPlay
                    />
                  )}

                  <div className="absolute left-3 bottom-3 flex items-center gap-2">
                    <span className="px-2 py-1 rounded-full bg-black/70 text-white text-xs">
                      {isSelf ? "You" : participantId.slice(0, 8)}
                    </span>
                    {mediaState?.audioMuted && (
                      <span className="w-8 h-8 rounded-full bg-amber-500/90 flex items-center justify-center">
                        <MicOff className="w-4 h-4 text-white" />
                      </span>
                    )}
                    {mediaState?.videoOff && activeGroupRoom.type === "video" && (
                      <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                        <VideoOff className="w-4 h-4 text-white" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 sm:p-6 border-t border-slate-800 flex flex-wrap justify-center gap-3 bg-slate-950">
            {callStatus === "incoming_ringing" && (
              <button
                onClick={() => void joinGroupRoom()}
                className="h-14 px-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center gap-2"
              >
                <Phone className="w-5 h-5" />
                Join
              </button>
            )}
            <button
              onClick={toggleMute}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all",
                isMuted ? "bg-slate-200 text-slate-950" : "bg-slate-800 hover:bg-slate-700",
              )}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            {activeGroupRoom.type === "video" && (
              <button
                onClick={toggleVideo}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all",
                  isVideoOff ? "bg-slate-200 text-slate-950" : "bg-slate-800 hover:bg-slate-700",
                )}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
              </button>
            )}
            <button
              onClick={toggleCallRecording}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all",
                isCallRecording ? "bg-red-500" : "bg-slate-800 hover:bg-slate-700",
              )}
              title={featureSupport.recording ? "Local recording" : "Recording unsupported"}
            >
              <Radio className="w-6 h-6" />
            </button>
            {activeGroupRoom.type === "video" && (
              <button
                onClick={takeSnapshot}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all bg-slate-800 hover:bg-slate-700"
                title="Snapshot"
              >
                <ImageIcon className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={() => void leaveGroupRoom(activeGroupRoom.hostId === currentUser.id)}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600"
              title="Leave group call"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>
        </motion.div>
      )}

      {activeCall && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}
          ref={containerRef}
          className="w-full h-full md:w-[85%] md:h-[90%] md:max-w-6xl md:rounded-2xl bg-black flex flex-col items-center shadow-[0_0_60px_rgba(0,0,0,0.6)] border border-slate-700 relative overflow-hidden"
        >
          <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800 transition-colors backdrop-blur-md"
              title="Minimize call"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800 transition-colors backdrop-blur-md"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              <Maximize2 className="w-5 h-5" />
            </button>
            {activeCall.isVideo && (
                <button
                  onClick={togglePiP}
                  className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800 transition-colors backdrop-blur-md"
                  title="Picture-in-Picture"
                >
                  <PictureInPicture className="w-5 h-5" />
                </button>
            )}
          </div>
          
          <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2 text-xs font-mono">
            {callStatus === "connected" && (
              <span
                className={cn(
                  "px-2 py-1 rounded uppercase tracking-widest backdrop-blur-md border flex items-center gap-1",
                  callQuality.label === "poor"
                    ? "bg-red-500/85 text-white border-red-300/40"
                    : callQuality.label === "fair"
                      ? "bg-amber-500/85 text-slate-950 border-amber-200/50"
                      : "bg-emerald-500/80 text-white border-emerald-300/40",
                )}
              >
                <Gauge className="w-3 h-3" />
                {callQuality.label}
                {typeof callQuality.rttMs === "number" ? ` ${callQuality.rttMs}ms` : ""}
              </span>
            )}
            {remoteQuality && remoteQuality !== "auto" && activeCall.isVideo && (
                 <span className="px-2 py-1 bg-black/60 text-white rounded uppercase tracking-widest backdrop-blur-md border border-slate-700/50">{remoteQuality}</span>
            )}
            {remoteBeautyMode && remoteBeautyMode !== "off" && activeCall.isVideo && (
                 <span className="px-2 py-1 bg-pink-500/80 text-white rounded flex items-center gap-1 backdrop-blur-md"><Sparkles className="w-3 h-3"/> Filter ON</span>
            )}
            {remoteScreenSharing && (
               <span className="px-2 py-1 bg-emerald-500/90 text-white rounded shadow-lg backdrop-blur-md flex items-center gap-1">
                 <MonitorUp className="w-3 h-3" /> {otherName} sharing screen
               </span>
            )}
            {isScreenSharing && (
               <span className="px-2 py-1 bg-sky-500/90 text-white rounded shadow-lg backdrop-blur-md flex items-center gap-1">
                 <MonitorUp className="w-3 h-3" /> You are sharing screen
               </span>
            )}
            {isCallRecording && (
              <span className="px-2 py-1 bg-red-500/90 text-white rounded shadow-lg backdrop-blur-md flex items-center gap-1">
                <Radio className="w-3 h-3" /> Recording locally
              </span>
            )}
          </div>

          <div 
            className={cn(
               "absolute transition-all duration-300",
               isSwapped ? "z-30 w-32 h-48 sm:w-48 sm:h-64 bg-slate-800 rounded-xl overflow-hidden shadow-2xl border border-slate-700 cursor-pointer bottom-[100px] right-[20px]" : "inset-0 flex items-center justify-center bg-slate-900/50 w-full h-full z-10"
            )}
            onClick={isSwapped ? toggleSwap : undefined}
          >
            <div 
               className="absolute inset-0 opacity-30 z-0 bg-cover bg-center" 
               style={{ 
                   backgroundImage: otherAvatar
                     ? `linear-gradient(rgba(15,23,42,0.82), rgba(15,23,42,0.82)), url(${otherAvatar})`
                     : "linear-gradient(135deg, #020617, #111827)",
               }} 
            />
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onDoubleClick={toggleFullscreen}
              style={{
                filter: getBeautyCssFilter(remoteBeautyMode),
              }}
              className={cn(
                "w-full h-full cursor-pointer relative z-10",
                isSwapped ? "object-cover" : "object-contain bg-black",
                (!activeCall.isVideo || !remoteStream?.getVideoTracks()[0]?.enabled) && "hidden",
              )}
            />
            {(!activeCall.isVideo || !remoteStream?.getVideoTracks()[0]?.enabled) && (
              <div className="flex flex-col items-center px-4 sm:px-6 text-center z-10 p-2 relative h-full justify-center">
                <div className={cn("rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-white shadow-2xl relative overflow-hidden", isSwapped ? "w-16 h-16 text-2xl mb-2" : "w-32 h-32 text-5xl mb-6")}>
                  <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl animate-pulse" />
                  {otherAvatar ? (
                    <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover relative z-10" />
                  ) : (
                    <span className="relative z-10">{otherName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {!isSwapped && (
                  <>
                    <h2 className="text-white text-3xl font-bold mb-2">{otherName}</h2>
                    <p className="text-emerald-400 font-mono tracking-widest flex items-center justify-center gap-2">
                      {statusLabel}
                    </p>
                  </>
                )}
                {activeCall.isVideo && !remoteStream?.getVideoTracks()[0]?.enabled && callStatus === "connected" && !isSwapped && (
                    <p className="mt-4 text-slate-400 text-sm flex items-center justify-center gap-2 relative z-20 bg-black/40 px-3 py-1.5 rounded-full border border-slate-700/50">
                        <VideoOff className="w-4 h-4 text-amber-400" /> {otherName} turned off their camera
                    </p>
                )}
              </div>
            )}
          </div>

          {activeCall.isVideo && (
            <motion.div 
               drag={!isSwapped}
               dragConstraints={containerRef}
               dragElastic={0}
               dragMomentum={false}
               animate={isSwapped ? { x: 0, y: 0 } : undefined}
               className={cn(
                 "absolute transition-all duration-300 overflow-hidden shadow-2xl border border-slate-700 bg-slate-800",
                 !isSwapped ? "z-30 w-32 h-48 sm:w-48 sm:h-64 rounded-xl cursor-move bottom-[100px] right-[20px]" : "inset-0 flex items-center justify-center w-full h-full z-10 rounded-none border-0"
               )}
               style={!isSwapped ? { bottom: "100px", right: "20px" } : { bottom: 0, right: 0 }}
               onClick={!isSwapped ? toggleSwap : undefined}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  transform: isScreenSharing ? "none" : "scaleX(-1)",
                  filter: isScreenSharing ? "none" : getBeautyCssFilter(beautyMode),
                }}
                className={cn("w-full h-full pointer-events-none", isSwapped ? "object-contain bg-black" : "object-cover bg-slate-900", isVideoOff && !isScreenSharing && "hidden")}
              />
              {isVideoOff && !isScreenSharing && (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900 pointer-events-none">
                  <VideoOff className={cn("opacity-50", isSwapped ? "w-16 h-16 mb-4" : "w-8 h-8 mb-2")} />
                  <span className={cn("font-mono uppercase", isSwapped ? "text-lg" : "text-[10px]")}>Camera Off</span>
                </div>
              )}
            </motion.div>
          )}

          {captionsEnabled && captionText && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-28 z-40 max-w-[90%] rounded-2xl bg-black/75 border border-white/10 px-4 py-3 text-center text-white text-sm sm:text-base shadow-2xl">
              {captionText}
            </div>
          )}

          <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 flex flex-wrap justify-center gap-3 sm:gap-5 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent z-40">
            <button
              onClick={toggleMute}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg",
                isMuted
                  ? "bg-slate-200 text-slate-900"
                  : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700",
              )}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {activeCall.isVideo && (
              <button
                onClick={toggleVideo}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg",
                  isVideoOff
                    ? "bg-slate-200 text-slate-900"
                    : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700",
                )}
                title={isVideoOff ? "Turn camera on" : "Turn camera off"}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
              </button>
            )}

            {activeCall.isVideo && featureSupport.screenShare && (
              <button
                onClick={() => {
                  if (isScreenSharing) void stopScreenShare();
                  else void startScreenShare();
                }}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg",
                  isScreenSharing
                    ? "bg-sky-500 hover:bg-sky-600"
                    : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700",
                )}
                title={isScreenSharing ? "Stop screen share" : "Share screen"}
              >
                {isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <MonitorUp className="w-6 h-6" />}
              </button>
            )}

            <button
              onClick={toggleCallRecording}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg border",
                isCallRecording
                  ? "bg-red-500 border-red-400 hover:bg-red-600"
                  : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border-slate-700",
                !featureSupport.recording && "opacity-50",
              )}
              title={featureSupport.recording ? "Record locally" : "Recording unsupported"}
            >
              {isCallRecording ? <Download className="w-6 h-6" /> : <Radio className="w-6 h-6" />}
            </button>

            <button
              onClick={toggleCaptions}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg border",
                captionsEnabled
                  ? "bg-cyan-500 border-cyan-300"
                  : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border-slate-700",
                !featureSupport.captions && "opacity-50",
              )}
              title={featureSupport.captions ? "Browser captions" : "Captions unsupported"}
            >
              <Captions className="w-6 h-6" />
            </button>

            {activeCall.isVideo && (
              <button
                onClick={takeSnapshot}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700"
                title="Save snapshot locally"
              >
                <ImageIcon className="w-6 h-6" />
              </button>
            )}

            {activeCall.isVideo && videoInputs.length > 1 && (
              <button
                onClick={() => void switchCamera()}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700"
                title="Switch camera"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
            )}

            {activeCall.isVideo && (
               <div className="relative">
                 <button
                   onClick={() => setShowAdvanced(!showAdvanced)}
                   className={cn(
                     "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg backdrop-blur-md border border-slate-700",
                     showAdvanced ? "bg-indigo-500" : "bg-slate-800 hover:bg-slate-700"
                   )}
                   title="Video Settings"
                 >
                   <Settings className="w-6 h-6" />
                 </button>
                 
                 {showAdvanced && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 animate-in slide-in-from-bottom-2 fade-in">
                        <div>
                            <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Video Quality</p>
                            <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg">
                                {["auto", "720p", "1080p", "2k"].map(q => (
                                    <button 
                                      key={q}
                                      onClick={() => void switchCameraConfig(q as any)}
                                      className={cn(
                                          "flex-1 text-xs py-1.5 rounded-md font-medium transition-all capitalize",
                                          videoQuality === q ? "bg-indigo-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                                      )}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Beauty Filter
                            </p>
                            <div className="flex flex-wrap gap-1 bg-slate-900/50 p-1 rounded-lg">
                                {[
                                  ["off", "Off"],
                                  ["bw", "B&W"],
                                  ["vivid", "Vivid"],
                                  ["dreamy", "Dreamy"],
                                  ["beauty", "Beauty"],
                                ].map(([mode, label]) => (
                                    <button 
                                      key={mode}
                                      onClick={() => void changeBeautyMode(mode as any)}
                                      className={cn(
                                          "px-3 flex-1 min-w-[70px] text-xs py-1.5 rounded-md font-medium transition-all capitalize",
                                          beautyMode === mode ? "bg-pink-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                                      )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {isScreenSharing && beautyMode !== "off" && (
                                <p className="text-[10px] text-amber-400 mt-2 text-center">Disabled while screen sharing</p>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Camera
                                <select
                                  value={selectedVideoDeviceId}
                                  onChange={(event) => setSelectedVideoDeviceId(event.target.value)}
                                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none"
                                >
                                  {videoInputs.length ? (
                                    videoInputs.map((device, index) => (
                                      <option key={device.deviceId || index} value={device.deviceId}>
                                        {device.label || `Camera ${index + 1}`}
                                      </option>
                                    ))
                                  ) : (
                                    <option value="">Default camera</option>
                                  )}
                                </select>
                            </label>
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Microphone
                                <select
                                  value={selectedAudioDeviceId}
                                  onChange={(event) => setSelectedAudioDeviceId(event.target.value)}
                                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none"
                                >
                                  {audioInputs.length ? (
                                    audioInputs.map((device, index) => (
                                      <option key={device.deviceId || index} value={device.deviceId}>
                                        {device.label || `Microphone ${index + 1}`}
                                      </option>
                                    ))
                                  ) : (
                                    <option value="">Default microphone</option>
                                  )}
                                </select>
                            </label>
                        </div>
                        {localResolution && (
                             <div className="pt-2 border-t border-slate-700 text-center">
                                 <p className="text-xs text-slate-500 font-mono">Current: <span className="text-slate-300">{localResolution}</span></p>
                             </div>
                        )}
                    </div>
                 )}
               </div>
            )}

            <button
              onClick={endActiveCall}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg hover:shadow-red-500/50"
              title="End call"
            >
              <PhoneOff className="w-7 h-7" />
            </button>

            {activeCall.isVideo && !videoInputs.length && (
              <button
                onClick={() => void refreshVideoInputs()}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700"
                title="Detect cameras"
              >
                <Camera className="w-6 h-6" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
    </AnimatePresence>
  );
}
