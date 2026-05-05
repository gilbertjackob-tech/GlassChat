import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video as VideoIcon, Mic, MicOff, VideoOff } from 'lucide-react';
import { useSocket } from '../SocketContext';
import { User } from '../types';
import { cn } from '../lib/utils';
import { API_BASE } from '../api';

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

interface CallData {
  chatId: string;
  callerId: string;
  callerName: string;
  isVideo: boolean;
  callLogId?: string;
  offer?: RTCSessionDescriptionInit;
}

interface CallOverlayProps {
  currentUser: User;
}

export function CallOverlay({ currentUser }: CallOverlayProps) {
  const { socket } = useSocket();
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);
  const [activeCall, setActiveCall] = useState<CallData | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [hasError, setHasError] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const currentCallLogIdRef = useRef<string | null>(null);

  const cleanupCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
  };

  const createCallLog = async (data: CallData) => {
    try {
      // Find who the other participant is (we hack this by checking if we are caller)
      let calleeId = "unknown";
      // This part is a bit tricky since we don't have the members list easily.
      // But we can store it for caller.
      const res = await fetch(`${window.location.origin}/api/calls`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          callerId: data.callerId,
          calleeId: data.callerId === currentUser.id ? "callee" : currentUser.id,
          chatId: data.chatId,
          type: data.isVideo ? "video" : "audio",
          status: "ringing",
        })
      });
      const resData = await res.json();
      currentCallLogIdRef.current = resData.id;
      return resData.id;
    } catch { return null; }
  };

  const updateCallLog = async (status: string, extra?: any) => {
    if (!currentCallLogIdRef.current) return;
    try {
      await fetch(`${window.location.origin}/api/calls/${currentCallLogIdRef.current}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ status, ...extra })
      });
    } catch {}
  };

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: CallData) => {
      if (data.callerId !== currentUser.id) {
        setIncomingCall(data);
        socket.emit("call:ringing", { chatId: data.chatId, receiverId: currentUser.id });
      }
    };

    const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      try {
        if (pcRef.current && pcRef.current.signalingState !== "stable") {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        updateCallLog("answered", { answeredAt: Date.now() });
      } catch (err) {
        console.error(err);
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      try {
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error(err);
      }
    };

    const handleCallReject = () => {
      updateCallLog("rejected", { endedAt: Date.now() });
      cleanupCall();
    };

    const handleCallEnd = () => {
      updateCallLog("ended", { endedAt: Date.now(), durationSeconds: callDuration });
      cleanupCall();
    };

    const startOutgoingCall = async (e: Event) => {
      const customEvent = e as CustomEvent<CallData>;
      const { chatId, callerId, callerName, isVideo } = customEvent.detail;

      if (!window.isSecureContext && window.location.hostname !== "localhost") {
         setHasError("Camera and microphone require HTTPS on mobile browsers. Use Tailscale Serve HTTPS URL.");
         setTimeout(() => setHasError(""), 5000);
         return;
      }

      setActiveCall(customEvent.detail);
      
      try {
        const logId = await createCallLog(customEvent.detail);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          remoteStreamRef.current = event.streams[0];
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("call:ice-candidate", { chatId, candidate: event.candidate });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("call:start", { chatId, callerId, callerName, isVideo, offer, callLogId: logId });
      } catch (err) {
        console.error("Failed to start call", err);
        setHasError("Could not access camera/microphone. Please ensure permissions are granted.");
        cleanupCall();
      }
    };

    window.addEventListener('START_CALL', startOutgoingCall);
    socket.on('call:start', handleIncomingCall);
    socket.on('call:answer', handleCallAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:reject', handleCallReject);
    socket.on('call:end', handleCallEnd);

    // Compat for old events
    socket.on('call_user', handleIncomingCall);
    socket.on('call_ended', handleCallEnd);

    return () => {
      window.removeEventListener('START_CALL', startOutgoingCall);
      socket.off('call:start', handleIncomingCall);
      socket.off('call:answer', handleCallAnswer);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:reject', handleCallReject);
      socket.off('call:end', handleCallEnd);
      socket.off('call_user', handleIncomingCall);
      socket.off('call_ended', handleCallEnd);
    };
  }, [socket, currentUser]);

  useEffect(() => {
    let interval: any;
    if (activeCall) {
      interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [activeCall]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [activeCall, isVideoOff]);

  const acceptCall = async () => {
    if (!socket || !incomingCall) return;

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
       setHasError("Camera and microphone require HTTPS on mobile browsers. Use Tailscale Serve HTTPS URL.");
       setTimeout(() => {
         setHasError("");
         rejectCall();
       }, 3000);
       return;
    }

    const { chatId, isVideo, offer, callLogId } = incomingCall;
    currentCallLogIdRef.current = callLogId || null;
    setActiveCall(incomingCall);
    setIncomingCall(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("call:ice-candidate", { chatId, candidate: event.candidate });
        }
      };

      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call:answer", { chatId, answer });
      } else {
        // Fallback if no offer was passed
        socket.emit("answer_call", { chatId, answer: {} });
      }

      updateCallLog("answered", { answeredAt: Date.now() });

    } catch (err) {
      console.error(err);
      socket.emit("call:failed", { chatId });
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (!socket || !incomingCall) return;
    socket.emit('call:reject', { chatId: incomingCall.chatId });
    updateCallLog("rejected", { endedAt: Date.now() });
    setIncomingCall(null);
  };

  const endActiveCall = () => {
    if (!socket || !activeCall) return;
    socket.emit('call:end', { chatId: activeCall.chatId });
    updateCallLog("ended", { endedAt: Date.now(), durationSeconds: callDuration });
    cleanupCall();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

  if (!incomingCall && !activeCall && !hasError) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
      
      {hasError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg shadow-2xl z-50 animate-in slide-in-from-top-4">
          <p className="font-bold text-sm">Action Required</p>
          <p className="text-xs mt-1">{hasError}</p>
        </div>
      )}

      {incomingCall && !activeCall && (
        <div className="bg-slate-900 rounded-2xl p-8 flex flex-col items-center shadow-2xl w-[320px] border border-slate-700 mx-4 shadow-[0_0_40px_rgba(79,70,229,0.2)] animate-in zoom-in duration-300">
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-4xl mb-6 shadow-inner relative">
             <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500 opacity-20"></span>
             {incomingCall.callerName.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call</h2>
          <p className="text-slate-400 mb-8">{incomingCall.callerName}</p>
          
          <div className="flex space-x-6">
            <button onClick={rejectCall} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg hover:shadow-red-500/50">
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
           
           {/* Remote Video or Audio Placeholder */}
           <div className="flex-1 w-full flex items-center justify-center bg-slate-900 relative">
             <video 
               ref={remoteVideoRef} 
               autoPlay 
               playsInline 
               className={cn("w-full h-full object-cover", (!activeCall.isVideo || !remoteStreamRef.current?.getVideoTracks()[0]?.enabled) && "hidden")} 
             />
             {(!activeCall.isVideo || !remoteStreamRef.current?.getVideoTracks()[0]?.enabled) && (
               <div className="flex flex-col items-center">
                 <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-5xl mb-6 text-white shadow-2xl relative">
                   <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl animate-pulse"></div>
                   {activeCall.callerName.charAt(0).toUpperCase()}
                 </div>
                 <h2 className="text-white text-3xl font-bold mb-2">{activeCall.callerName}</h2>
                 <p className="text-emerald-400 font-mono tracking-widest">{formatDuration(callDuration)}</p>
               </div>
             )}
           </div>

           {/* Local Video Picture-in-Picture */}
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

          {/* Controls */}
          <div className="absolute bottom-0 inset-x-0 p-6 flex justify-center space-x-4 sm:space-x-8 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent">
            <button 
              onClick={toggleMute} 
              className={cn("w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg", isMuted ? "bg-slate-200 text-slate-900" : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700")}
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
                className={cn("w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg", isVideoOff ? "bg-slate-200 text-slate-900" : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md border border-slate-700")}
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
