import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';
import { useSocket } from '../SocketContext';
import { User } from '../types';
import { cn } from '../lib/utils';

interface CallData {
  chatId: string;
  callerId: string;
  callerName: string;
  isVideo: boolean;
  offer?: any;
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

  // We are simulating the "call active" state for UI perfection.
  // In a real app we would use RTCPeerConnection here.
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: CallData) => {
      if (data.callerId !== currentUser.id) {
        setIncomingCall(data);
      }
    };

    const handleCallAnswered = (data: any) => {
      // If we are the caller and someone answered
    };

    const handleCallEnded = () => {
      setIncomingCall(null);
      setActiveCall(null);
      setCallDuration(0);
    };

    const handleStartCallEvent = (e: Event) => {
      const customEvent = e as CustomEvent<CallData>;
      // For outgoing, we assume answered immediately for local UI simulation
      setActiveCall(customEvent.detail);
    };

    window.addEventListener('START_CALL', handleStartCallEvent);
    socket.on('incoming_call', handleIncomingCall);
    socket.on('call_answered', handleCallAnswered);
    socket.on('call_ended', handleCallEnded);

    return () => {
      window.removeEventListener('START_CALL', handleStartCallEvent);
      socket.off('incoming_call', handleIncomingCall);
      socket.off('call_answered', handleCallAnswered);
      socket.off('call_ended', handleCallEnded);
    };
  }, [socket, currentUser]);

  useEffect(() => {
    let interval: any;
    if (activeCall) {
      interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [activeCall]);

  const acceptCall = () => {
    if (!socket || !incomingCall) return;
    socket.emit('answer_call', { chatId: incomingCall.chatId, answer: {} });
    setActiveCall(incomingCall);
    setIncomingCall(null);
  };

  const rejectCall = () => {
    if (!socket || !incomingCall) return;
    socket.emit('end_call', { chatId: incomingCall.chatId });
    setIncomingCall(null);
  };

  const endActiveCall = () => {
    if (!socket || !activeCall) return;
    socket.emit('end_call', { chatId: activeCall.chatId });
    setActiveCall(null);
    setCallDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!incomingCall && !activeCall) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
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
              {incomingCall.isVideo ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </button>
          </div>
        </div>
      )}

      {activeCall && (
        <div className="w-full h-full md:w-[60%] md:h-[80%] md:rounded-2xl bg-slate-900 flex flex-col items-center shadow-2xl border border-slate-700 relative overflow-hidden animate-in fade-in zoom-in duration-300">
          {activeCall.isVideo && !isVideoOff ? (
            <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
              {/* Fake video feed for UI feel using standard placeholder or camera icon */}
              <div className="text-slate-600 flex flex-col items-center">
                 <Video className="w-20 h-20 mb-4 opacity-50" />
                 <span className="text-xs uppercase tracking-widest opacity-50">Remote Feed Connected</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center w-full">
               <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-5xl mb-6 text-white shadow-2xl relative">
                 <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl animate-pulse"></div>
                 {activeCall.callerName.charAt(0).toUpperCase()}
               </div>
               <h2 className="text-white text-3xl font-bold mb-2">{activeCall.callerName}</h2>
               <p className="text-emerald-400 font-mono tracking-widest">{formatDuration(callDuration)}</p>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-0 inset-x-0 p-8 flex justify-center space-x-6 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className={cn("w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg", isMuted ? "bg-slate-700" : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md")}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button 
              onClick={endActiveCall} 
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg hover:shadow-red-500/50"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <button 
              onClick={() => setIsVideoOff(!isVideoOff)} 
              className={cn("w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-lg", isVideoOff ? "bg-slate-700" : "bg-slate-800 hover:bg-slate-700 backdrop-blur-md")}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
