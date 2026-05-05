import { useState, useEffect, useRef } from "react";
import { CircleDashed, Plus, X, Type, Image as ImageIcon, Send, Clock, Eye } from "lucide-react";
import { User } from "../types";
import { cn } from "../lib/utils";
import { API_BASE } from "../api";

interface StatusPaneProps {
  currentUser: User;
}

interface Status {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  attachmentUrl: string;
  attachmentType: string;
  backgroundColor: string;
  duration: number;
  timestamp: number;
  views: { userId: string; timestamp: number }[];
}

export function StatusPane({ currentUser }: StatusPaneProps) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [createText, setCreateText] = useState("");
  const [createBg, setCreateBg] = useState("#8b5cf6");
  const [createFile, setCreateFile] = useState<File | null>(null);
  
  // Viewing state
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatuses = async () => {
    try {
      const res = await fetch(`${API_BASE}/statuses?userId=${currentUser.id}`);
      if (res.ok) {
        setStatuses(await res.json());
      }
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
    const int = setInterval(fetchStatuses, 10000);
    return () => clearInterval(int);
  }, [currentUser.id]);

  const handleCreateStatus = async () => {
    if (!createText && !createFile) return;
    try {
      let attachmentUrl = "";
      let attachmentType = "";
      
      if (createFile) {
        const formData = new FormData();
        formData.append("file", createFile);
        const uploadRes = await fetch(`${API_BASE}/files/upload`, {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          attachmentUrl = data.url;
          attachmentType = createFile.type;
        }
      }

      const res = await fetch(`${API_BASE}/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          text: createText,
          attachmentUrl,
          attachmentType,
          backgroundColor: createFile ? "" : createBg,
          duration: 5000,
        })
      });
      if (res.ok) {
        setIsCreating(false);
        setCreateText("");
        setCreateFile(null);
        fetchStatuses();
      }
    } catch(err) {
      console.error(err);
    }
  };

  const markViewed = async (statusId: string) => {
    try {
      await fetch(`${API_BASE}/statuses/${statusId}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id })
      });
    } catch(err) {}
  };

  const grouped = statuses.reduce((acc, status) => {
    if (!acc[status.userId]) {
      acc[status.userId] = {
        userId: status.userId,
        userName: status.userName || "Unknown",
        userAvatar: status.userAvatar,
        statuses: []
      };
    }
    acc[status.userId].statuses.push(status);
    return acc;
  }, {} as Record<string, {userId: string; userName: string; userAvatar: string; statuses: Status[]}>);

  const myStatuses = grouped[currentUser.id]?.statuses || [];
  delete grouped[currentUser.id];
  const otherUsers = Object.values(grouped);

  // Simple viewer
  useEffect(() => {
    if (viewingUser) {
      const userStatuses = viewingUser === currentUser.id ? myStatuses : grouped[viewingUser]?.statuses || [];
      const currentStatus = userStatuses[viewIndex];
      if (currentStatus) {
         if (currentStatus.userId !== currentUser.id && !currentStatus.views.some((v: any) => v.userId === currentUser.id)) {
            markViewed(currentStatus.id);
         }
         const timer = setTimeout(() => {
            if (viewIndex < userStatuses.length - 1) {
              setViewIndex(prev => prev + 1);
            } else {
              setViewingUser(null);
            }
         }, currentStatus.duration || 5000);
         return () => clearTimeout(timer);
      }
    }
  }, [viewingUser, viewIndex, myStatuses, grouped, currentUser.id]);

  if (viewingUser) {
    const userGroup = viewingUser === currentUser.id ? { userId: currentUser.id, userName: currentUser.name, userAvatar: currentUser.avatar || "", statuses: myStatuses } : grouped[viewingUser];
    if (!userGroup) return null;
    const currentStatus = userGroup.statuses[viewIndex];

    return (
      <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col items-center justify-center">
         <div className="flex w-full absolute top-0 pt-4 px-2 gap-1 z-10">
            {userGroup.statuses.map((s, i) => (
               <div key={s.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                 {i < viewIndex && <div className="h-full bg-white w-full" />}
                 {i === viewIndex && <div className="h-full bg-white w-full animate-[progress_5s_linear]" style={{ animationDuration: `${(s.duration || 5000)}ms` }} />}
               </div>
            ))}
         </div>
         <div className="absolute top-8 left-4 z-10 flex items-center gap-3">
             <button onClick={() => setViewingUser(null)} className="p-2 hover:bg-white/20 rounded-full">
               <X className="w-6 h-6" />
             </button>
             <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800">
                {userGroup.userAvatar ? <img src={userGroup.userAvatar} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center">{userGroup.userName.charAt(0)}</div>}
             </div>
             <div>
                <p className="font-medium">{userGroup.userName}</p>
                <p className="text-xs text-white/70">{new Date(currentStatus.timestamp).toLocaleTimeString()}</p>
             </div>
         </div>
         
         <div className="w-full h-full flex items-center justify-center relative select-none" 
              onClick={(e) => {
                 const x = e.clientX;
                 if (x < window.innerWidth / 3) {
                    if (viewIndex > 0) setViewIndex(prev => prev - 1);
                 } else {
                    if (viewIndex < userGroup.statuses.length - 1) setViewIndex(prev => prev + 1);
                    else setViewingUser(null);
                 }
              }}>
            {currentStatus.attachmentType?.startsWith('image/') ? (
               <img src={currentStatus.attachmentUrl} className="max-w-full max-h-full object-contain" />
            ) : currentStatus.attachmentType?.startsWith('video/') ? (
               <video src={currentStatus.attachmentUrl} autoPlay className="max-w-full max-h-full object-contain" />
            ) : (
               <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: currentStatus.backgroundColor }}>
                  <p className="text-3xl text-center font-medium leading-relaxed whitespace-pre-wrap">{currentStatus.text}</p>
               </div>
            )}
            
            {viewingUser === currentUser.id && (
               <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 bg-black/40 px-4 py-2 rounded-xl backdrop-blur-md">
                 <Eye className="w-5 h-5 text-white/80" />
                 <span className="text-sm font-bold">{currentStatus.views.length} views</span>
               </div>
            )}
         </div>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col bg-slate-900 text-white">
        <div className="h-16 flex items-center px-4 border-b border-slate-800 gap-4">
          <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-300">
             <X className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-medium">Create status</h2>
          <div className="flex-1" />
          <button onClick={() => {
              const bgs = ["#8b5cf6", "#f43f5e", "#10b981", "#3b82f6", "#eab308", "#222222"];
              const currentIndex = bgs.indexOf(createBg);
              setCreateBg(bgs[(currentIndex + 1) % bgs.length]);
          }} className="p-2 hover:bg-slate-800 rounded-full text-slate-300">
             <div className="w-6 h-6 rounded-full border-2 border-white" style={{ backgroundColor: createBg }} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center relative p-4" style={{ backgroundColor: createFile ? '#000' : createBg }}>
           {createFile ? (
               createFile.type.startsWith('video/') ? (
                  <video src={URL.createObjectURL(createFile)} className="w-full h-full object-contain" controls />
               ) : (
                  <img src={URL.createObjectURL(createFile)} className="w-full h-full object-contain" />
               )
           ) : (
             <textarea 
               value={createText}
               onChange={e => setCreateText(e.target.value)}
               placeholder="Type a status"
               className="w-full max-w-sm text-center text-3xl font-medium bg-transparent text-white placeholder:text-white/50 border-none outline-none resize-none focus:ring-0"
               rows={5}
               autoFocus
             />
           )}
        </div>
        <div className="h-20 bg-slate-900 border-t border-slate-800 flex items-center px-4 gap-4">
           <input type="file" className="hidden" ref={fileInputRef} accept="image/*,video/*" onChange={e => {
               if (e.target.files && e.target.files[0]) {
                   setCreateFile(e.target.files[0]);
               }
           }} />
           <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 transition-colors">
              <ImageIcon className="w-6 h-6" />
           </button>
           <button onClick={() => {
               setCreateFile(null);
               fileInputRef.current && (fileInputRef.current.value = "");
           }} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 transition-colors">
              <Type className="w-6 h-6" />
           </button>
           <div className="flex-1" />
           <button 
             onClick={handleCreateStatus}
             disabled={!createText.trim() && !createFile}
             className="p-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full transition-colors flex items-center justify-center transform hover:scale-105 active:scale-95"
           >
              <Send className="w-6 h-6 ml-1" />
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto w-full px-4 text-slate-800 dark:text-slate-200 hide-scrollbar pb-24">
      {/* My Status */}
      <div className="py-4">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => myStatuses.length > 0 ? (setViewingUser(currentUser.id), setViewIndex(0)) : setIsCreating(true)}>
          <div className="relative w-14 h-14 shrink-0">
             <div className={cn("w-full h-full rounded-full overflow-hidden", myStatuses.length > 0 ? "p-0.5 border-2 border-emerald-500" : "")}>
                 <div className="w-full h-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-[#111b21]">
                   {currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xl">{currentUser.name.charAt(0)}</div>}
                 </div>
             </div>
             <button
               onClick={(e) => { e.stopPropagation(); setIsCreating(true); }}
               className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center border-2 border-white dark:border-[#111b21] shadow-sm hover:scale-110 transition-transform"
             >
               <Plus className="w-3 h-3" />
             </button>
          </div>
          <div>
            <h3 className="font-semibold text-base">{myStatuses.length > 0 ? "My status" : "My status"}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
               {myStatuses.length > 0 
                  ? `${myStatuses.length} updates` 
                  : "Tap to add status update"}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-2" />

      {/* Recent updates */}
      {otherUsers.length > 0 ? (
        <div>
           <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 mt-2">Recent updates</h4>
           <div className="flex flex-col gap-4">
             {otherUsers.map(u => (
                <div key={u.userId} className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 -mx-2 rounded-lg transition-colors" onClick={() => {
                   setViewingUser(u.userId);
                   setViewIndex(0);
                }}>
                   <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden p-0.5 border-2 border-emerald-500">
                       <div className="w-full h-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-[#111b21]">
                         {u.userAvatar ? <img src={u.userAvatar} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xl">{u.userName.charAt(0)}</div>}
                       </div>
                   </div>
                   <div>
                     <h3 className="font-semibold text-base">{u.userName}</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400">
                       {new Date(u.statuses[u.statuses.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
                     </p>
                   </div>
                </div>
             ))}
           </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-[#8696a0]">
          <CircleDashed className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-600/50" />
          <p>No recent updates</p>
        </div>
      )}
      
      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
