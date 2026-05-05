import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Video as VideoIcon,
  Mic,
  MicOff,
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
  const [callDuration, setCallDuration] = useState(0);
  const [hasError, setHasError] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingOffersRef = useRef<Map<string, SignalPayload>>(new Map());
  const peerUserIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const activeCallRef = useRef<CallData | null>(null);
  const incomingCallRef = useRef<CallData | null>(null);
  const callStatusRef = useRef<CallStatus>("idle");
  const timeoutRefs = useRef<number[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  const clearTimers = () => {
    timeoutRefs.current.forEach((id) => window.clearTimeout(id));
    timeoutRefs.current = [];
  };

  const resetState = () => {
    clearTimers();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    peerUserIdRef.current = null;
    connectedAtRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
    setCallDuration(0);
    setCallStatus("idle");
    setIsMuted(false);
    setIsVideoOff(false);
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

  const attachPeerHandlers = (pc: RTCPeerConnection, call: CallData) => {
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
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
        setCallStatus("outgoing_calling");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

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
  }, [activeCall, isVideoOff, localStream, remoteStream]);

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

    const offerData = pendingOffersRef.current.get(incomingCall.callId);
    const offer = incomingCall.offer || offerData?.offer;
    if (!offer || !offerData?.fromUserId) {
      setHasError("Call offer was not received. Ask the caller to try again.");
      window.setTimeout(() => setHasError(""), 3000);
      return;
    }

    clearTimers();
    peerUserIdRef.current = offerData.fromUserId;
    setActiveCall(incomingCall);
    setIncomingCall(null);
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
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      attachPeerHandlers(pc, incomingCall);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const displayCall = activeCall || incomingCall;
  const isCaller = displayCall?.callerId === currentUser.id;
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

  if (!incomingCall && !activeCall && !hasError) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
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
          <p className="text-emerald-400 text-sm mb-8">{statusLabel}</p>

          <div className="flex space-x-6">
            <button onClick={declineCall} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg hover:shadow-red-500/50">
              <PhoneOff className="w-6 h-6" />
            </button>
            <button onClick={acceptCall} className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white hover:bg-emerald-600 hover:scale-105 transition-all shadow-lg hover:shadow-emerald-500/50 animate-pulse">
              {incomingCall.isVideo ? <VideoIcon className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </button>
          </div>
        </div>
      )}

      {activeCall && (
        <div className="w-full h-full md:w-[60%] md:h-[80%] md:rounded-2xl bg-black flex flex-col items-center shadow-2xl border border-slate-700 relative overflow-hidden animate-in fade-in zoom-in duration-300">
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
            {(!activeCall.isVideo || !remoteStream?.getVideoTracks()[0]?.enabled) && (
              <div className="flex flex-col items-center">
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
                className={cn("w-full h-full object-cover", isVideoOff && "hidden")}
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-900">
                  <VideoOff className="w-8 h-8 opacity-50" />
                </div>
              )}
            </div>
          )}

          <div className="absolute bottom-0 inset-x-0 p-6 flex justify-center space-x-4 sm:space-x-8 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent">
            <button
              onClick={toggleMute}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg",
                isMuted
                  ? "bg-slate-200 text-slate-900"
                  : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700",
              )}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              onClick={endActiveCall}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg hover:shadow-red-500/50"
            >
              <PhoneOff className="w-7 h-7" />
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
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
