import React, { useState, useEffect } from "react";
import { X, Search, Check, Send } from "lucide-react";
import { Chat, Message } from "../types";
import { fetchChats, sendMessage } from "../api";
import { cn } from "../lib/utils";

interface ForwardModalProps {
  message: Message;
  currentUser: import("../types").User;
  onClose: () => void;
  onForwardSuccess: () => void;
}

export function ForwardModal({
  message,
  currentUser,
  onClose,
  onForwardSuccess,
}: ForwardModalProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState("");
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    fetchChats()
      .then((data) => {
        setChats(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filteredChats = chats.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSelect = (chatId: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId],
    );
  };

  const handleForward = async () => {
    if (selectedChatIds.length === 0) return;
    setForwarding(true);
    try {
      for (const chatId of selectedChatIds) {
        // Prepare attachment fields if they exist
        await sendMessage(
          chatId,
          message.text || "",
          message.attachmentUrl,
          message.attachmentType,
          currentUser.id,
          currentUser.name,
          currentUser.avatar,
          message.location,
        );
      }
      onForwardSuccess();
      onClose();
    } catch (e) {
      console.error("Failed to forward message", e);
    } finally {
      setForwarding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-[#202c33] rounded-xl w-full max-w-sm shadow-xl flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-[#2f3b43]">
          <h3 className="font-semibold text-slate-800 dark:text-[#e9edef]">
            Forward message to
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-[#e9edef] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 dark:border-[#2f3b43]">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search chats"
              className="w-full bg-slate-100 dark:bg-[#111b21] border-none rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-[#e9edef] placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00a884]/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="text-center py-8 text-slate-500 dark:text-[#8696a0] text-sm">
              Loading chats...
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-[#8696a0] text-sm">
              No chats found.
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => toggleSelect(chat.id)}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#111b21] cursor-pointer transition-colors"
              >
                <div className="relative shrink-0">
                  <img
                    src={chat.avatar}
                    alt={chat.name}
                    className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 object-cover"
                  />
                  {selectedChatIds.includes(chat.id) && (
                    <div className="absolute -bottom-1 -right-1 bg-[#00a884] rounded-full p-0.5 border-2 border-white dark:border-[#202c33]">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <div className="flex-1 truncate">
                  <h4 className="font-semibold text-slate-800 dark:text-[#e9edef] text-sm truncate">
                    {chat.name}
                  </h4>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedChatIds.length > 0 && (
          <div className="p-3 border-t border-slate-100 dark:border-[#2f3b43] bg-slate-50 dark:bg-[#202c33]">
            <button
              onClick={handleForward}
              disabled={forwarding}
              className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center disabled:opacity-50 space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>
                {forwarding
                  ? "Forwarding..."
                  : `Forward to ${selectedChatIds.length} ${selectedChatIds.length === 1 ? "chat" : "chats"}`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
