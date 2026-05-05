import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { User, CallStatus } from './types';

interface CallData {
  callId: string;
  chatId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerAvatar?: string;
  isVideo: boolean;
  toUserId?: string;
  status?: CallStatus;
}

interface CallContextType {
  activeCall: CallData | null;
  incomingCall: CallData | null;
  callStatus: CallStatus;
  callDuration: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isMinimized: boolean;
  isScreenSharing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (chatId: string, calleeId: string, isVideo: boolean) => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  setMinimized: (v: boolean) => void;
  hasError: string;
  clearError: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export function CallProvider({ children, currentUser }: { children: ReactNode, currentUser: User | null }) {
  const { socket } = useSocket();
  const [activeCall, setActiveCall] = useState<CallData | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle" as any);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMinimized, setMinimized] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasError, setHasError] = useState("");
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationInterval = useRef<any>(null);

  const resetState = useCallback(() => {
    setActiveCall(null);
    setIncomingCall(null);
    setCallStatus("idle" as any);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    if (durationInterval.current) clearInterval(durationInterval.current);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const endCallWithSocket = useCallback((reason: string) => {
    if (socket && activeCall) {
      const toUserId = activeCall.callerId === currentUser?.id ? activeCall.calleeId : activeCall.callerId;
      socket.emit("call:end", { callId: activeCall.callId, chatId: activeCall.chatId, toUserId, endReason: reason });
    }
    resetState();
  }, [socket, activeCall, currentUser, resetState]);

  useEffect(() => {
    if (!socket || !currentUser) return;

    const handleIncoming = (data: CallData) => {
       if (activeCall || incomingCall) {
         // Busy
         socket.emit("call:end", { callId: data.callId, toUserId: data.callerId, endReason: "busy" });
         return;
       }
       setIncomingCall(data);
       setCallStatus("incoming_ringing");
       socket.emit("call:received_ack", { callId: data.callId, callerId: data.callerId });
    };

    const handleRinging = () => {
      setCallStatus("outgoing_ringing");
    };

    const handleAccepted = async (data: any) => {
      setCallStatus("connecting");
      try {
        if (!pcRef.current) return;
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socket.emit("call:offer", { callId: data.callId, chatId: data.chatId, toUserId: activeCall?.calleeId, offer });
      } catch (err) {
        setHasError("Error establishing connection");
        endCallWithSocket("failed");
      }
    };

    const handleOffer = async (data: any) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit("call:answer", { callId: data.callId, chatId: data.chatId, toUserId: data.fromUserId || (incomingCall ? incomingCall.callerId : ''), answer });
      } catch (err) {
        console.error(err);
      }
    };

    const handleAnswer = async (data: any) => {
      if (!pcRef.current) return;
      try {
         await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
         // Once connection established, timer starts via oniceconnectionstatechange
      } catch (err) { }
    };

    const handleIceCandidate = async (data: any) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) { }
    };

    const handleEnded = (data: any) => {
        setCallStatus("ended");
        setTimeout(resetState, 2000);
    };

    const handleDeclined = () => {
        setCallStatus("declined");
        setTimeout(resetState, 2000);
    };

    const handleUnavailable = () => {
        setCallStatus("unavailable");
        setTimeout(resetState, 2000);
    };

    const handleFailed = () => {
        setCallStatus("failed");
        setTimeout(resetState, 2000);
    };

    socket.on("call:incoming", handleIncoming);
    socket.on("call:ringing", handleRinging);
    socket.on("call:accepted", handleAccepted);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);
    socket.on("call:ended", handleEnded);
    socket.on("call:declined", handleDeclined);
    socket.on("call:unavailable", handleUnavailable);
    socket.on("call:failed", handleFailed);

    return () => {
       socket.off("call:incoming", handleIncoming);
       socket.off("call:ringing", handleRinging);
       socket.off("call:accepted", handleAccepted);
       socket.off("call:offer", handleOffer);
       socket.off("call:answer", handleAnswer);
       socket.off("call:ice-candidate", handleIceCandidate);
       socket.off("call:ended", handleEnded);
       socket.off("call:declined", handleDeclined);
       socket.off("call:unavailable", handleUnavailable);
       socket.off("call:failed", handleFailed);
    };
  }, [socket, currentUser, activeCall, incomingCall, resetState, endCallWithSocket]);

  const initWebRTC = async (isVideo: boolean, toUserId: string, callId: string, chatId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("call:ice-candidate", { callId, chatId, toUserId, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      pc.oniceconnectionstatechange = () => {
         if (pc.iceConnectionState === "connected") {
            setCallStatus("connected");
            socket?.emit("call:connected", { callId });
            if (!durationInterval.current) {
                durationInterval.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
            }
         } else if (pc.iceConnectionState === "disconnected") {
            setCallStatus("reconnecting");
         } else if (pc.iceConnectionState === "failed") {
            setCallStatus("failed");
            setTimeout(() => endCallWithSocket("network_lost"), 3000);
         }
      };

      return pc;
    } catch (err) {
      setHasError("Camera/microphone access denied.");
      return null;
    }
  };

  const startCall = async (chatId: string, calleeId: string, isVideo: boolean) => {
    if (!currentUser) return;
    const callId = "call_" + Math.random().toString(36).substr(2, 9);
    
    const callData: CallData = {
      callId,
      chatId,
      callerId: currentUser.id,
      callerName: currentUser.name,
      calleeId,
      isVideo
    };
    
    setActiveCall(callData);
    setCallStatus("outgoing_calling");
    setMinimized(false);

    const pc = await initWebRTC(isVideo, calleeId, callId, chatId);
    if (!pc) {
      resetState();
      return;
    }

    socket?.emit("call:start", callData);

    // Timeout if no ack
    setTimeout(() => {
       if (callStatus === "outgoing_calling") {
          // Could be offline
       }
    }, 20000);
  };

  const acceptCall = async () => {
    if (!incomingCall || !currentUser) return;
    setActiveCall(incomingCall);
    setIncomingCall(null);
    setCallStatus("connecting");

    const pc = await initWebRTC(incomingCall.isVideo, incomingCall.callerId, incomingCall.callId, incomingCall.chatId);
    if (!pc) {
      socket?.emit("call:end", { callId: incomingCall.callId, toUserId: incomingCall.callerId, endReason: "failed" });
      resetState();
      return;
    }

    socket?.emit("call:accept", { callId: incomingCall.callId, callerId: incomingCall.callerId, chatId: incomingCall.chatId, fromUserId: currentUser.id });
  };

  const declineCall = () => {
    if (incomingCall && socket) {
      socket.emit("call:decline", { callId: incomingCall.callId, callerId: incomingCall.callerId });
    }
    resetState();
  };

  const endCall = () => {
    endCallWithSocket("ended_by_user");
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!pcRef.current || !localStreamRef.current) return;
    
    if (isScreenSharing) {
        // Stop screen sharing and revert to camera
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: !isVideoOff });
            const videoTrack = stream.getVideoTracks()[0];
            const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
            
            // Update local stream
            const oldTracks = localStreamRef.current.getVideoTracks();
            oldTracks.forEach(t => localStreamRef.current?.removeTrack(t));
            if (videoTrack) localStreamRef.current.addTrack(videoTrack);
            setLocalStream(null); 
            setTimeout(() => setLocalStream(localStreamRef.current), 0); // trigger re-render
            
            setIsScreenSharing(false);
        } catch (e) {
            console.error("Failed to restore camera", e);
        }
    } else {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = stream.getVideoTracks()[0];
            
            screenTrack.onended = () => {
                toggleScreenShare(); // revert when stopped via browser UI
            };

            const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender && screenTrack) {
                sender.replaceTrack(screenTrack);
            }

            // Update local stream
            const oldTracks = localStreamRef.current.getVideoTracks();
            oldTracks.forEach(t => localStreamRef.current?.removeTrack(t));
            if (screenTrack) localStreamRef.current.addTrack(screenTrack);
            setLocalStream(null);
            setTimeout(() => setLocalStream(localStreamRef.current), 0);
            
            setIsScreenSharing(true);
        } catch (err) {
            console.error("Screen sharing failed", err);
            // unsupported or denied
            setHasError("Screen sharing is not supported on this device/browser or was denied.");
        }
    }
  };

  const clearError = () => setHasError("");

  useEffect(() => {
     // handle page unload
     const handleUnload = () => {
        if (activeCall) {
           endCallWithSocket("network_lost");
        }
     };
     window.addEventListener("beforeunload", handleUnload);
     return () => window.removeEventListener("beforeunload", handleUnload);
  }, [activeCall, endCallWithSocket]);

  return (
    <CallContext.Provider value={{
      activeCall, incomingCall, callStatus, callDuration,
      isMuted, isVideoOff, isMinimized, isScreenSharing, localStream, remoteStream,
      startCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleScreenShare, setMinimized,
      hasError, clearError
    }}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
};
