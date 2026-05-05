import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorOff,
  MonitorUp,
  Phone,
  PhoneOff,
  RotateCcw,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import { useSocket } from "../SocketContext";
import { CallData, CallStatus, User } from "../types";
import { cn } from "../lib/utils";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type StartCallDetail = {
  chatId: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar?: string;
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
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingOffersRef = useRef<Map<string, SignalPayload>>(new Map());
  const peerUserIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const activeCallRef = useRef<CallData | null>(null);
  const incomingCallRef = useRef<CallData | null>(null);
  const callStatusRef = useRef<CallStatus>("idle");
  const timeoutRefs = useRef<number[]>([]);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const minimizedRemoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  const clearTimers = () => {
    timeoutRefs.current.forEach((id) => window.clearTimeout(id));
    timeoutRefs.current = [];
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const stopTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const resetState = () => {
    clearTimers();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
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
  ) => {
    emitForActiveCall("call:media-state", {
      audioMuted,
      videoOff,
      screenSharing,
    });
  };

  const getIncomingOffer = (call: CallData) => {
    const offerData = pendingOffersRef.current.get(call.callId);
    const offer = call.offer || offerData?.offer;
    const fromUserId = offerData?.fromUserId || call.callerId;
    return offer && fromUserId ? { offer, fromUserId } : null;
  };

  const refreshVideoInputs = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      setVideoInputs(cameras);
      if (!selectedVideoDeviceId && cameras[0]?.deviceId) {
        setSelectedVideoDeviceId(cameras[0].deviceId);
      }
    } catch (err) {
      console.error("Could not enumerate cameras", err);
    }
  };

  const attachPeerHandlers = (pc: RTCPeerConnection, call: CallData) => {
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
        if (!connectedAtRef.current) connectedAtRef.current = Date.now();
        setCallStatus("connected");
        const signal = buildSignal(call);
        if (signal) emitSignal("call:connected", signal);
      } else if (pc.connectionState === "disconnected") {
        setCallStatus("reconnecting");
      } else if (pc.connectionState === "failed") {
        const signal = buildSignal(call);
        if (signal) emitSignal("call:failed", { ...signal, reason: "network_lost" });
        finishAfterStatus("failed", "Call failed");
      }
    };
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
        }
        setCallStatus("connecting");
      } catch (err) {
        console.error(err);
      }
    };

    const handleIceCandidate = async (data: SignalPayload) => {
      if (data.toUserId !== currentUser.id || !data.candidate) return;
      try {
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
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

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo,
        });
        localStreamRef.current = stream;
        cameraVideoTrackRef.current = stream.getVideoTracks()[0] || null;
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        void refreshVideoInputs();

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
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

    window.addEventListener("START_CALL", startOutgoingCall);
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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.isVideo,
      });
      localStreamRef.current = stream;
      cameraVideoTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      void refreshVideoInputs();

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      attachPeerHandlers(pc, incomingCall);

      await pc.setRemoteDescription(new RTCSessionDescription(offerData.offer));
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
    setIncomingCall(null);
    setCallStatus("idle");
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
    resetState();
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
    }
  };

  const toggleVideo = () => {
    const videoTrack = cameraVideoTrackRef.current || localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const nextVideoOff = !videoTrack.enabled;
      setIsVideoOff(nextVideoOff);
      emitMediaState(isMuted, nextVideoOff, isScreenSharing);
    }
  };

  const findVideoSender = () =>
    pcRef.current?.getSenders().find((sender) => sender.track?.kind === "video");

  const startScreenShare = async () => {
    if (!activeCall?.isVideo) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setHasError("Screen sharing is not supported on this device/browser.");
      window.setTimeout(() => setHasError(""), 4000);
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setHasError("Screen sharing requires HTTPS. Use Tailscale Serve HTTPS URL.");
      window.setTimeout(() => setHasError(""), 5000);
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
      } else if (pcRef.current) {
        pcRef.current.addTrack(screenVideoTrack, displayStream);
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
        await sender.replaceTrack(cameraTrack);
      } else if (sender && isVideoOff) {
        await sender.replaceTrack(null);
      }
    } catch (err) {
      console.error("Could not restore camera after screen share", err);
    } finally {
      stopTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      setScreenStream(null);
      setLocalStream(localStreamRef.current);
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
        video: { deviceId: { exact: nextDevice.deviceId } },
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

      if (!isScreenSharing) {
        const sender = findVideoSender();
        if (sender) await sender.replaceTrack(nextTrack);
      }

      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      const combinedStream = new MediaStream([...audioTracks, nextTrack]);
      localStreamRef.current = combinedStream;
      if (!isScreenSharing) setLocalStream(combinedStream);
      oldVideoTrack?.stop();
    } catch (err) {
      console.error("Could not switch camera", err);
      setHasError("Could not switch camera.");
      window.setTimeout(() => setHasError(""), 3000);
    }
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
                        : "";

  const renderAvatar = (sizeClass: string) => (
    <div className={cn("rounded-full bg-slate-800 flex items-center justify-center overflow-hidden", sizeClass)}>
      {otherAvatar ? (
        <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-bold">{otherName.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );

  if (!incomingCall && !activeCall && !hasError) return null;

  if (activeCall && isMinimized) {
    const showMiniVideo = activeCall.isVideo && remoteStream?.getVideoTracks()[0]?.enabled;
    return (
      <>
        {hasError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg shadow-2xl z-50">
            <p className="font-bold text-sm">Call status</p>
            <p className="text-xs mt-1">{hasError}</p>
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsMinimized(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setIsMinimized(false);
          }}
          className={cn(
            "fixed z-40 bg-slate-950/95 text-white shadow-2xl border border-slate-700 backdrop-blur-md cursor-pointer",
            activeCall.isVideo
              ? "bottom-20 right-3 w-48 h-32 sm:bottom-4 sm:right-4 sm:w-64 sm:h-40 rounded-xl overflow-hidden"
              : "bottom-20 right-3 left-3 sm:left-auto sm:bottom-4 sm:right-4 sm:w-80 rounded-full px-3 py-3",
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
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{otherName}</p>
                    <p className="text-xs text-emerald-300 font-mono">{statusLabel}</p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      endActiveCall();
                    }}
                    className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center shrink-0"
                    title="End call"
                  >
                    <PhoneOff className="w-4 h-4" />
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
                className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shrink-0"
                title="End call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
      {hasError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg shadow-2xl z-50 animate-in slide-in-from-top-4">
          <p className="font-bold text-sm">Call status</p>
          <p className="text-xs mt-1">{hasError}</p>
        </div>
      )}

      {incomingCall && !activeCall && (
        <div className="bg-slate-900 rounded-2xl p-8 flex flex-col items-center shadow-2xl w-[320px] border border-slate-700 mx-4 shadow-[0_0_40px_rgba(79,70,229,0.2)] animate-in zoom-in duration-300">
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-4xl mb-6 shadow-inner relative overflow-hidden">
            <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20" />
            {otherAvatar ? (
              <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover" />
            ) : (
              <span>{otherName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <h2 className="text-white text-xl font-bold mb-2">
            Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call
          </h2>
          <p className="text-slate-400 mb-2">{otherName}</p>
          <p className="text-emerald-400 text-sm mb-8">
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
        </div>
      )}

      {activeCall && (
        <div
          ref={containerRef}
          className="w-full h-full md:w-[70%] md:h-[86%] md:rounded-2xl bg-black flex flex-col items-center shadow-2xl border border-slate-700 relative overflow-hidden animate-in fade-in zoom-in duration-300"
        >
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800"
              title="Minimize call"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 w-full flex items-center justify-center bg-slate-900 relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={cn(
                "w-full h-full object-cover",
                (!activeCall.isVideo || !remoteStream?.getVideoTracks()[0]?.enabled) && "hidden",
              )}
            />
            {remoteScreenSharing && (
              <div className="absolute top-4 right-4 z-20 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                {otherName} is sharing screen
              </div>
            )}
            {isScreenSharing && (
              <div className="absolute top-16 right-4 z-20 rounded-full bg-sky-500/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                You are sharing screen
              </div>
            )}
            {(!activeCall.isVideo || !remoteStream?.getVideoTracks()[0]?.enabled) && (
              <div className="flex flex-col items-center px-6 text-center">
                <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-5xl mb-6 text-white shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl animate-pulse" />
                  {otherAvatar ? (
                    <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover relative z-10" />
                  ) : (
                    <span className="relative z-10">{otherName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <h2 className="text-white text-3xl font-bold mb-2">{otherName}</h2>
                <p className="text-emerald-400 font-mono tracking-widest">{statusLabel}</p>
              </div>
            )}
          </div>

          {activeCall.isVideo && (
            <div className="absolute top-4 right-4 w-24 h-32 sm:w-32 sm:h-48 bg-slate-800 rounded-lg overflow-hidden shadow-2xl border-2 border-slate-700">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn("w-full h-full object-cover", isVideoOff && !isScreenSharing && "hidden")}
              />
              {isVideoOff && !isScreenSharing && (
                <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-900">
                  <VideoOff className="w-8 h-8 opacity-50" />
                </div>
              )}
            </div>
          )}

          <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 flex flex-wrap justify-center gap-3 sm:gap-5 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent">
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

            {activeCall.isVideo && (
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

            {activeCall.isVideo && videoInputs.length > 1 && (
              <button
                onClick={() => void switchCamera()}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700"
                title="Switch camera"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
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
        </div>
      )}
    </div>
  );
}
