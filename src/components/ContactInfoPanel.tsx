import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { 
  X, Search, Trash2, Ban, 
  Image as ImageIcon, FileText, Link as LinkIcon, 
  Download, ChevronRight, MapPin, 
  ChevronLeft, FileIcon, Phone, Video
} from "lucide-react";
import { Chat, User } from "../types";
import { cn, formatLastActive } from "../lib/utils";
import { API_BASE, fetchChatAttachments } from "../api";

interface ContactInfoPanelProps {
  chat: Chat;
  currentUser: User;
  onClose: () => void;
  onSearch: () => void;
  onClearChat: () => void;
  onDeleteChat: () => void;
}

export function ContactInfoPanel({
  chat,
  currentUser,
  onClose,
  onSearch,
  onClearChat,
  onDeleteChat,
}: ContactInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<"info" | "media" | "files" | "links">("info");
  const [attachments, setAttachments] = useState<{
    media: any[];
    files: any[];
    links: any[];
  }>({ media: [], files: [], links: [] });

  useEffect(() => {
    fetchChatAttachments(chat.id)
      .then(setAttachments)
      .catch(console.error);
  }, [chat.id]);

  const otherParticipant = !chat.isGroup 
    ? chat.participants?.find((p) => p.id !== currentUser.id)
    : null;

  const chatName = otherParticipant ? otherParticipant.name : chat.name;
  const chatAvatar = otherParticipant?.avatar || chat.avatar;
  const isOnline = otherParticipant ? otherParticipant.online : false;
  const lastActive = otherParticipant?.lastActive;
  const phone = otherParticipant?.phone;
  const email = otherParticipant?.email;

  const initiateCall = (isVideo: boolean) => {
    if (chat.isGroup) {
      alert("Calls are only supported in direct chats.");
      return;
    }
    const calleeId = otherParticipant?.id;
    if (!calleeId) {
      alert("Could not find the other user to call.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("START_CALL", {
        detail: {
          chatId: chat.id,
          calleeId,
          calleeName: otherParticipant?.name || chatName,
          calleeAvatar: otherParticipant?.avatar,
          isVideo,
        },
      }),
    );
  };


  const renderTabs = () => {
    switch (activeTab) {
      case "media":
        return (
          <div className="p-4 grid grid-cols-3 gap-1">
            {attachments.media.length === 0 && (
              <div className="col-span-3 text-center py-10 text-slate-500">No media shared</div>
            )}
            {attachments.media.map(m => (
              <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="aspect-square bg-slate-200 dark:bg-slate-800 rounded flex items-center justify-center overflow-hidden hover:opacity-80 transition relative group">
                {m.mimeType.startsWith("video/") ? (
                  <video src={m.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={m.url} alt="media" className="w-full h-full object-cover" />
                )}
              </a>
            ))}
          </div>
        );
      case "files":
        return (
          <div className="p-4 flex flex-col space-y-2">
            {attachments.files.length === 0 && (
              <div className="text-center py-10 text-slate-500">No files shared</div>
            )}
            {attachments.files.map(f => (
              <div key={f.id} className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                 <div className="w-10 h-10 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500 shrink-0">
                   <FileText className="w-5 h-5" />
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{f.fileName || "Document"}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {f.size ? (f.size / 1024 / 1024).toFixed(2) + " MB" : "Unknown size"} • {format(new Date(f.createdAt), "MMM d")}
                    </p>
                 </div>
                 <a href={f.url} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition text-slate-500">
                   <Download className="w-4 h-4" />
                 </a>
              </div>
            ))}
          </div>
        );
      case "links":
        return (
          <div className="p-4 flex flex-col space-y-2">
            {attachments.links.length === 0 && (
              <div className="text-center py-10 text-slate-500">No links shared</div>
            )}
            {attachments.links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center space-x-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg group">
                <div className="w-10 h-10 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-indigo-500 hover:underline truncate">{l.url}</p>
                </div>
              </a>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-y-0 right-0 w-full md:w-[400px] bg-white dark:bg-[#111b21] z-50 flex flex-col border-l border-slate-200 dark:border-[#2f3b43] shadow-2xl animate-in slide-in-from-right-8 duration-300">
      
      {/* Header */}
      <div className="h-16 flex items-center px-4 bg-slate-50 dark:bg-[#202c33] shrink-0">
        <button onClick={onClose} className="p-2 mr-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-600 dark:text-[#aebac1]">
          <X className="w-5 h-5" />
        </button>
        <span className="font-medium text-slate-800 dark:text-[#e9edef]">Contact Info</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === "info" ? (
          <div>
            {/* Profile Info */}
            <div className="flex flex-col items-center py-8 bg-white dark:bg-[#111b21] border-b border-slate-100 dark:border-[#202c33]">
              <div className="w-40 h-40 rounded-full bg-slate-200 dark:bg-[#202c33] flex items-center justify-center text-slate-500 overflow-hidden mb-4 shadow-md text-5xl font-medium">
                {chatAvatar ? (
                   <img src={chatAvatar} alt={chatName} className="w-full h-full object-cover" />
                ) : (
                   chatName.charAt(0).toUpperCase()
                )}
              </div>
              <h2 className="text-2xl font-medium text-slate-800 dark:text-[#e9edef] mb-1">{chatName}</h2>
              {phone && <p className="text-lg text-slate-600 dark:text-[#8696a0] mb-1">{phone}</p>}
              {email && <p className="text-sm text-slate-500 dark:text-[#8696a0] mb-3">{email}</p>}
              
              {!chat.isGroup && (
                <div className="text-sm font-medium mb-6">
                  {isOnline ? (
                    <span className="text-emerald-500 dark:text-[#00a884]">Online</span>
                  ) : lastActive ? (
                    <span className="text-slate-500 dark:text-[#8696a0]">Last active {formatLastActive(lastActive)}</span>
                  ) : (
                   <span className="text-slate-500 dark:text-[#8696a0]">Offline</span>
                  )}
                </div>
              )}

              {!chat.isGroup && (
                 <div className="flex space-x-6 w-full justify-center px-4 mt-2">
                   <button 
                     onClick={() => initiateCall(false)}
                     className="flex flex-col items-center justify-center p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-500 dark:text-[#00a884] transition w-24"
                   >
                     <Phone className="w-6 h-6 mb-2" />
                     <span className="text-sm font-medium">Audio</span>
                   </button>
                   <button 
                     onClick={() => initiateCall(true)}
                     className="flex flex-col items-center justify-center p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-500 dark:text-[#00a884] transition w-24"
                   >
                     <Video className="w-6 h-6 mb-2" />
                     <span className="text-sm font-medium">Video</span>
                   </button>
                 </div>
              )}
            </div>

            {/* Media/Links Section Summary */}
            <div className="mt-2 bg-white dark:bg-[#111b21] border-y border-slate-100 dark:border-[#202c33] py-4">
               <div className="px-6 flex justify-between items-center mb-4">
                 <span className="text-[13px] text-slate-500 dark:text-[#8696a0] uppercase tracking-wide font-medium">
                   Media, links, and docs
                 </span>
                 <span className="text-[13px] text-slate-500 dark:text-[#8696a0]">
                   {attachments.media.length + attachments.files.length + attachments.links.length} {'>'}
                 </span>
               </div>
               
               <div className="flex px-4 space-x-2 overflow-x-auto custom-scrollbar pb-2">
                  <div 
                    onClick={() => setActiveTab("media")}
                    className="flex flex-col items-center justify-center w-[80px] h-[80px] shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                     <ImageIcon className="w-6 h-6 text-indigo-500 mb-1" />
                     <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{attachments.media.length} Media</span>
                  </div>
                  <div 
                    onClick={() => setActiveTab("files")}
                    className="flex flex-col items-center justify-center w-[80px] h-[80px] shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                     <FileIcon className="w-6 h-6 text-orange-500 mb-1" />
                     <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{attachments.files.length} Docs</span>
                  </div>
                  <div 
                    onClick={() => setActiveTab("links")}
                    className="flex flex-col items-center justify-center w-[80px] h-[80px] shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                     <LinkIcon className="w-6 h-6 text-emerald-500 mb-1" />
                     <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{attachments.links.length} Links</span>
                  </div>
               </div>
            </div>

            {/* Actions */}
            <div className="mt-2 bg-white dark:bg-[#111b21] border-y border-slate-100 dark:border-[#202c33]">
              <button 
                onClick={onSearch}
                className="w-full flex items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-[#202c33] transition"
              >
                <Search className="w-5 h-5 text-slate-500 dark:text-[#8696a0] mr-4" />
                <span className="text-slate-800 dark:text-[#e9edef] text-[15px]">Search in chat</span>
              </button>
            </div>

            {/* Destructive Actions */}
            <div className="mt-2 bg-white dark:bg-[#111b21] border-y border-slate-100 dark:border-[#202c33] mb-8">
              <button 
                onClick={onClearChat}
                className="w-full flex items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-[#202c33] transition"
              >
                <Ban className="w-5 h-5 text-red-500 mr-4" />
                <span className="text-red-500 text-[15px]">Clear chat locally</span>
              </button>
              <button 
                onClick={onDeleteChat}
                className="w-full flex items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-[#202c33] transition"
              >
                <Trash2 className="w-5 h-5 text-red-500 mr-4" />
                <span className="text-red-500 text-[15px]">Delete chat locally</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full bg-white dark:bg-[#111b21]">
             {/* Sub header back */}
             <div 
               className="flex items-center px-4 py-3 bg-slate-50 dark:bg-[#202c33] border-b border-slate-200 dark:border-[#2f3b43] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition"
               onClick={() => setActiveTab("info")}
             >
               <ChevronLeft className="w-5 h-5 text-slate-500 mr-2" />
               <span className="font-medium text-slate-800 dark:text-slate-200 capitalize w-full">{activeTab}</span>
             </div>
             <div className="flex-1 overflow-y-auto">
               {renderTabs()}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
