import React, { useEffect, useState, FormEvent, useCallback } from "react";
import { format } from "date-fns";
import {
  MessageSquarePlus,
  MoreVertical,
  Search,
  User as UserIcon,
  UserCircle2,
  ArrowLeft,
  Camera,
  Users,
  UserPlus,
  X,
  Phone,
  CircleDashed,
  Star,
  ChevronDown,
  Download,
  Upload,
  RefreshCw,
} from "lucide-react";
import CryptoJS from "crypto-js";
import { useSocket } from "../SocketContext";
import { CallHistoryItem, Chat, User, Contact } from "../types";
import {
  fetchChats,
  createChat,
  fetchStarredMessages,
  fetchUsers,
  createDirectChat,
  API_BASE,
} from "../api";
import { cn, formatLastActive } from "../lib/utils";
import { useTheme } from "../ThemeContext";

interface SidebarProps {
  activeChatId?: string;
  onSelectChat: (chat: Chat | null) => void;
  currentUser: User;
  onUpdateUser: (user: User | null) => void;
  activeRailTab: string;
  setActiveRailTab: (tab: string) => void;
}

export function Sidebar({
  activeChatId,
  onSelectChat,
  currentUser,
  onUpdateUser,
  activeRailTab,
  setActiveRailTab,
}: SidebarProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState("");
  const showProfile = activeRailTab === "profile";
  const showSettings = activeRailTab === "settings";
  const showCalls = activeRailTab === "calls";
  const showStatus = activeRailTab === "status";
  const showCommunities = activeRailTab === "communities";
  const showStarred = activeRailTab === "starred";

  // Options popup state should remain
  const [showOptionsPopup, setShowOptionsPopup] = useState(false);

  // Starred messages
  const [starredMessages, setStarredMessages] = useState<any[]>([]);

  useEffect(() => {
    if (showStarred) {
      fetchStarredMessages(currentUser.id)
        .then(setStarredMessages)
        .catch(console.error);
    }
  }, [showStarred, currentUser.id]);

  // Contacts and forms
  const [showContacts, setShowContacts] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [usersToChat, setUsersToChat] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const {
    theme,
    setTheme,
    enterIsSend,
    setEnterIsSend,
    chatWallpaper,
    setChatWallpaper,
  } = useTheme();

  const [privacy, setPrivacy] = useState<"none" | "contacts" | "everyone">(
    "everyone",
  );

  useEffect(() => {
    import("../api").then((api) => {
      api
        .fetchUserPresence(currentUser.id)
        .then((data) => {
          setPrivacy(data.privacy);
        })
        .catch(console.error);
    });
  }, [currentUser.id]);

  const handlePrivacyChange = (
    newPrivacy: "none" | "contacts" | "everyone",
  ) => {
    setPrivacy(newPrivacy);
    import("../api").then((api) => {
      api.updateUserPrivacy(currentUser.id, newPrivacy).catch(console.error);
    });
  };

  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem("whatsclone_contacts");
    if (saved) return JSON.parse(saved);
    return [
      { id: "c1", name: "Alice Smith", phone: "+1 555-0100", isBlocked: false },
      { id: "c2", name: "Bob Jones", phone: "+1 555-0200", isBlocked: false },
    ];
  });

  const { socket, isConnected } = useSocket();

  const sortUsersForDiscovery = useCallback(
    (users: User[]) =>
      users
        .filter((u) => u.id !== currentUser.id)
        .sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    [currentUser.id]
  );

  const refreshUserDiscovery = useCallback(
    async (query = userSearchQuery) => {
      try {
        const users = await fetchUsers(query);
        setUsersToChat(sortUsersForDiscovery(users));
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    },
    [userSearchQuery, sortUsersForDiscovery]
  );

  useEffect(() => {
    localStorage.setItem("whatsclone_contacts", JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    fetchChats(currentUser.id).then(setChats).catch(console.error);
  }, [currentUser.id]);

  useEffect(() => {
    if (!socket) return;

    socket.on("chat_updated", (updatedChat: Chat) => {
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === updatedChat.id);
        let showNote = false;
        if (idx !== -1) {
          const oldTime = prev[idx].lastMessageTime || 0;
          if (
            updatedChat.lastMessageTime &&
            updatedChat.lastMessageTime > oldTime
          ) {
            showNote = true;
          }
          const newChats = [...prev];
          newChats[idx] = updatedChat;
          if (showNote && activeChatId !== updatedChat.id) {
            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new window.Notification(updatedChat.name, {
                body: updatedChat.lastMessage,
                icon: updatedChat.avatar,
              });
            }
          }
          return newChats.sort(
            (a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0),
          );
        }
        return [updatedChat, ...prev];
      });
    });

    socket.on("new_chat", (newChat: Chat) => {
      setChats((prev) => [newChat, ...prev]);
    });

    const handleUserUpdate = () => {
      // Re-fetch users and chats
      if (showAddContact) {
         refreshUserDiscovery(userSearchQuery);
      }
      import("../api").then(api => api.fetchChats(currentUser.id).then(setChats).catch(console.error));
    };

    socket.on("user_updated", handleUserUpdate);
    socket.on("presence_updated", handleUserUpdate);

    return () => {
      socket.off("chat_updated");
      socket.off("new_chat");
      socket.off("user_updated", handleUserUpdate);
      socket.off("presence_updated", handleUserUpdate);
    };
  }, [socket, showAddContact, userSearchQuery, currentUser.id, refreshUserDiscovery]);

  const handleNewChat = () => {
    setShowContacts(true);
    setShowAddContact(true);
    setShowOptionsPopup(false);
    setUserSearchQuery("");
    refreshUserDiscovery("");
  };

  const handleCreateContactChat = async (contact: Contact) => {
    const existing = chats.find((c) => c.name === contact.name && !c.isGroup);
    if (existing) {
      onSelectChat(existing);
      setShowContacts(false);
      setActiveRailTab("chats");
      return;
    }
    const newChat = await createChat(contact.name, false);
    onSelectChat(newChat);
    setShowContacts(false);
    setActiveRailTab("chats");
  };

  const handleCreateGroup = async () => {
    const name = window.prompt("Enter new group name:");
    if (name) {
      const selectedMembers = contacts.slice(0, 2).map((c) => c.name);
      selectedMembers.push("You");
      const newChat = await createChat(name, true, selectedMembers);
      onSelectChat(newChat);
      setShowNewGroup(false);
      setActiveRailTab("chats");
    }
  };

  useEffect(() => {
    if (showAddContact) {
      refreshUserDiscovery(userSearchQuery);
    }
  }, [showAddContact, userSearchQuery, refreshUserDiscovery]);

  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      const newChat = await createDirectChat(currentUser.id, targetUserId);
      onSelectChat(newChat);
      setShowAddContact(false);
      setShowContacts(false);
      setActiveRailTab("chats");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateContact = (e: FormEvent) => {
    e.preventDefault();
    if (newContactName.trim() && newContactPhone.trim()) {
      setContacts([
        ...contacts,
        {
          id: "c" + Date.now(),
          name: newContactName,
          phone: newContactPhone,
          isBlocked: false,
        },
      ]);
      setShowAddContact(false);
      setNewContactName("");
      setNewContactPhone("");
    }
  };

  const deleteContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete this contact?")) {
      setContacts(contacts.filter((c) => c.id !== id));
    }
  };

  const handleExportData = async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (!res.ok) throw new Error("Failed to export data");
      const data = await res.json();

      const keyArray = new Uint8Array(16);
      window.crypto.getRandomValues(keyArray);
      const key = Array.from(keyArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(data),
        key,
      ).toString();

      const blob = new Blob([encrypted], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `whatsclone_export_${Date.now()}.enc`;
      a.click();
      URL.revokeObjectURL(url);

      alert(
        `Export successful!\n\nYour encryption key is:\n${key}\n\nPlease save this key! You MUST provide it when importing this file. We will now download your key as a text file.`,
      );

      const keyBlob = new Blob([`Encryption Key for imported file:\n${key}`], {
        type: "text/plain",
      });
      const keyUrl = URL.createObjectURL(keyBlob);
      const keyA = document.createElement("a");
      keyA.href = keyUrl;
      keyA.download = `whatsclone_export_key_${Date.now()}.txt`;
      keyA.click();
      URL.revokeObjectURL(keyUrl);
    } catch (err) {
      console.error(err);
      alert("Error exporting data");
    }
  };

  const handleImportData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".enc";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const key = prompt(
        "Please enter the decryption key for your export file:",
      );
      if (!key) return;

      const reader = new FileReader();
      reader.onload = async (re) => {
        try {
          const encryptedText = re.target?.result as string;
          const decrypted = CryptoJS.AES.decrypt(encryptedText, key).toString(
            CryptoJS.enc.Utf8,
          );
          if (!decrypted) throw new Error("Invalid key or corrupt file");

          const data = JSON.parse(decrypted);

          const res = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUser.id, data }),
          });

          if (!res.ok) throw new Error("Failed to import");
          alert("Import successful! Reloading to apply changes...");
          window.location.reload();
        } catch (err) {
          console.error(err);
          alert("Error importing data. Did you enter the correct key?");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const toggleBlockContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(
      contacts.map((c) =>
        c.id === id ? { ...c, isBlocked: !c.isBlocked } : c,
      ),
    );
  };

  const filteredChats = chats.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      !c.deletedFor?.includes(currentUser.id),
  );

  const isContactsTab = activeRailTab === "contacts";
  const contactsVisible = showContacts || isContactsTab;

  // Calls pane state
  const [callLogs, setCallLogs] = useState<CallHistoryItem[]>([]);
  useEffect(() => {
    if (showCalls) {
      if (typeof window !== "undefined") {
        fetch(`${API_BASE}/calls?userId=${encodeURIComponent(currentUser.id)}`)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`Failed to fetch calls: ${res.status}`);
            }
            return res.json();
          })
          .then((data) => {
            setCallLogs(Array.isArray(data) ? data : []);
          })
          .catch((err) => {
            console.error(err);
            setCallLogs([]);
          });
      }
    }
  }, [showCalls, currentUser.id]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 z-10 w-full relative overflow-hidden shadow-sm transition-colors duration-300">
      {/* Header */}
      <div className="h-16 flex-none bg-slate-50 dark:bg-[#111b21] flex flex-row items-center justify-between px-4 transition-colors duration-300">
        <h1 className="text-[22px] font-bold text-slate-800 dark:text-[#e9edef]">
          Chats
        </h1>
        <div className="flex items-center space-x-4 text-slate-500 dark:text-[#aebac1] relative">
          <div
            className="flex items-center space-x-1"
            title={isConnected ? "WebSocket Connected" : "Disconnected"}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-[#00a884]" : "bg-red-500",
              )}
            />
            <span className="text-[10px] uppercase tracking-wider font-bold hidden sm:inline">
              {isConnected ? "Connected" : "Offline"}
            </span>
          </div>
          <button onClick={handleNewChat} title="New Chat">
            <MessageSquarePlus className="w-5 h-5 cursor-pointer hover:text-indigo-600 dark:hover:text-[#e9edef] transition-colors" />
          </button>
          <button
            onClick={() => setShowOptionsPopup(!showOptionsPopup)}
            title="More"
          >
            <MoreVertical className="w-5 h-5 cursor-pointer hover:text-indigo-600 dark:hover:text-[#e9edef] transition-colors" />
          </button>

          {/* Options Popup */}
          {showOptionsPopup && (
            <div className="absolute top-10 right-0 bg-white dark:bg-[#202c33] shadow-xl rounded-lg border border-slate-100 dark:border-[#2f3b43] py-2 w-48 z-50">
              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-[#e9edef] hover:bg-slate-50 dark:hover:bg-[#111b21] transition-colors"
                onClick={() => {
                  setShowNewGroup(true);
                  setShowOptionsPopup(false);
                }}
              >
                New group
              </button>
              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-[#e9edef] hover:bg-slate-50 dark:hover:bg-[#111b21] transition-colors"
                onClick={() => {
                  setActiveRailTab("starred");
                  setShowOptionsPopup(false);
                }}
              >
                Starred messages
              </button>
              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-[#e9edef] hover:bg-slate-50 dark:hover:bg-[#111b21] transition-colors"
                onClick={() => {
                  setActiveRailTab("settings");
                  setShowOptionsPopup(false);
                }}
              >
                Settings
              </button>
              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-[#e9edef] hover:bg-slate-50 dark:hover:bg-[#111b21] transition-colors"
                onClick={() => setShowOptionsPopup(false)}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex-none p-3 bg-slate-50 dark:bg-[#111b21] transition-colors duration-300">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-slate-400 dark:text-[#8696a0]" />
          <input
            type="text"
            placeholder="Search or start a new chat"
            className="w-full bg-slate-100 dark:bg-[#202c33] rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-transparent text-slate-800 dark:text-[#d1d7db] transition-all font-sans placeholder-[#8696a0]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 mt-3 px-1">
          <span className="px-3 py-1 bg-slate-200 dark:bg-[#202c33] text-slate-700 dark:text-[#00a884] rounded-full text-[13px] font-medium cursor-pointer hover:bg-slate-300 dark:hover:bg-[#374248] transition-colors">
            All
          </span>
          <span className="px-3 py-1 bg-slate-200 dark:bg-[#202c33] text-slate-700 dark:text-[#8696a0] rounded-full text-[13px] font-medium cursor-pointer hover:bg-slate-300 dark:hover:bg-[#374248] transition-colors">
            Unread 26
          </span>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-[#111b21]">
        {filteredChats.map((chat) => {
          const isActive = activeChatId === chat.id;
          const otherParticipant = !chat.isGroup 
            ? chat.participants?.find((p) => p.id !== currentUser.id)
            : null;
            
          const chatName = otherParticipant ? otherParticipant.name : chat.name;
          const chatAvatar = otherParticipant?.avatar || chat.avatar;
          const isOnline = otherParticipant ? otherParticipant.online : false;

          let subtitle = chat.lastMessage;
          if (!subtitle) {
             subtitle = isOnline 
               ? "Online" 
               : otherParticipant?.lastActive 
                 ? `Last active ${formatLastActive(otherParticipant.lastActive)}` 
                 : "Tap to get started";
          }

          return (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className={cn(
                "p-3 flex items-center space-x-3 cursor-pointer transition-colors dark:border-[#2f3b43] group",
                isActive
                  ? "bg-indigo-50 dark:bg-[#2a3942]"
                  : "hover:bg-slate-50 dark:hover:bg-[#202c33]",
              )}
            >
              <div className="relative w-12 h-12 rounded-full bg-slate-300 dark:bg-[#202c33] flex-shrink-0 flex items-center justify-center text-slate-800 dark:text-[#aebac1] font-bold overflow-visible text-lg">
                {chatAvatar ? (
                  <img
                    src={chatAvatar}
                    alt="Avatar"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  chatName.charAt(0).toUpperCase()
                )}
                {isOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#111b21] rounded-full"></span>
                )}
              </div>
              <div className="flex-1 min-w-0 border-b border-slate-100 dark:border-[#2f3b43] pb-3 pt-1 relative">
                <div className="flex justify-between items-baseline mb-1">
                  <h4
                    className={cn(
                      "font-medium truncate text-[17px] mr-2",
                      isActive
                        ? "text-indigo-900 dark:text-[#e9edef]"
                        : "text-slate-800 dark:text-[#e9edef]",
                    )}
                  >
                    {chatName}
                  </h4>
                  <span
                    className={cn(
                      "text-[12px] shrink-0 font-medium group-hover:hidden",
                      chat.unreadCount
                        ? "text-emerald-500 dark:text-[#00a884]"
                        : "text-slate-400 dark:text-[#8696a0]",
                    )}
                  >
                    {chat.lastMessageTime
                      ? format(new Date(chat.lastMessageTime), "HH:mm")
                      : ""}
                  </span>

                  {/* Delete Button (visible on hover instead of timestamp) */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const { deleteChat } = await import("../api");
                        await deleteChat(chat.id, currentUser.id);
                        setChats((prev) =>
                          prev.map((c) =>
                            c.id === chat.id
                              ? {
                                  ...c,
                                  deletedFor: [
                                    ...(c.deletedFor || []),
                                    currentUser.id,
                                  ],
                                }
                              : c,
                          ),
                        );
                        if (activeChatId === chat.id) {
                          onSelectChat(null);
                        }
                      } catch (err) {
                        console.error("Failed to delete chat", err);
                      }
                    }}
                    className="hidden group-hover:flex items-center justify-center -mr-1"
                    title="Delete Chat"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-400 hover:text-red-500" />
                  </button>
                </div>
                <div className="flex justify-between items-baseline">
                  <p
                    className={cn(
                      "text-sm truncate mr-4",
                      isActive
                        ? "text-indigo-600 dark:text-[#aebac1]"
                        : "text-slate-500 dark:text-[#8696a0]",
                    )}
                  >
                    {subtitle}
                  </p>
                  {chat.unreadCount ? (
                    <span className="bg-[#00a884] text-[#111b21] text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0 min-w-[20px] text-center">
                      {chat.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Profile Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-slate-50 dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showProfile ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className="h-28 bg-indigo-600 dark:bg-[#202c33] text-white flex items-end px-6 pb-4 cursor-pointer"
          onClick={() => setActiveRailTab("chats")}
        >
          <div className="flex items-center space-x-6 text-[#e9edef]">
            <ArrowLeft className="w-6 h-6 hover:scale-110 transition-transform" />
            <h2 className="text-[19px] font-medium">Profile</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-0">
          <div className="flex justify-center py-8 relative">
            <label className="w-40 h-40 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 cursor-pointer overflow-hidden border-2 border-transparent hover:border-indigo-400 transition-colors group relative">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserCircle2 className="w-32 h-32" />
              )}
              <div className="absolute inset-0 bg-black/40 hidden group-hover:flex flex-col items-center justify-center text-white text-xs">
                <Camera className="w-8 h-8 mb-1" />
                CHANGE
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const { uploadFile } = await import("../api");
                    const data = await uploadFile(file, currentUser.id);
                    const newAvatarUrl = data.url;
                    
                    const res = await fetch(`${API_BASE}/users/${currentUser.id}/profile`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ avatar: newAvatarUrl })
                    });
                    if (res.status === 404) {
                      localStorage.removeItem("whatsclone_user_real");
                      alert("Your local user no longer exists. Please register again.");
                      onUpdateUser(null);
                    } else if (res.ok) {
                      onUpdateUser({
                        ...currentUser,
                        avatar: newAvatarUrl,
                      });
                    } else {
                      console.error("Failed to update profile avatar on server");
                      alert("Failed to update profile photo. Please try again.");
                    }
                  } catch (err) {
                    console.error("Failed to upload avatar", err);
                    alert("Failed to update profile photo. Please try again.");
                  }
                }}
              />
            </label>
          </div>
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
              <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2 block">
                Your Name
              </label>
              <input
                type="text"
                value={currentUser.name}
                onChange={(e) =>
                  onUpdateUser({ ...currentUser, name: e.target.value })
                }
                onBlur={async (e) => {
                   try {
                     const res = await fetch(`${API_BASE}/users/${currentUser.id}/profile`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: e.target.value })
                     });
                     if (res.status === 404) {
                       localStorage.removeItem("whatsclone_user_real");
                       alert("Your local user no longer exists. Please register again.");
                       onUpdateUser(null);
                     } else if (!res.ok) {
                       console.error("Failed to update name on server");
                       alert("Failed to update profile name. Please try again.");
                     }
                   } catch (err) {
                     console.error("Failed to update name", err);
                     alert("Failed to update profile name. Please try again.");
                   }
                }}
                className="text-sm font-semibold text-slate-800 dark:text-slate-200 w-full outline-none bg-transparent"
              />
            </div>
            <div className="p-4 rounded-lg text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-800 shadow-sm">
              This is not your username or pin. This name will be visible to
              your WhatsClone Web contacts.
            </div>
          </div>
        </div>
      </div>

      {/* Settings Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-slate-50 dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showSettings ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className="h-28 bg-indigo-600 dark:bg-[#202c33] text-white flex items-end px-6 pb-4 cursor-pointer"
          onClick={() => setActiveRailTab("chats")}
        >
          <div className="flex items-center space-x-6 text-[#e9edef]">
            <ArrowLeft className="w-6 h-6 hover:scale-110 transition-transform" />
            <h2 className="text-[19px] font-medium">Settings</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Settings Profile Header */}
          <div
            className="flex items-center space-x-4 p-4 bg-white dark:bg-[#111b21] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#202c33]"
            onClick={() => setActiveRailTab("profile")}
          >
            <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400 shrink-0">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt="Profile"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <UserCircle2 className="w-10 h-10" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate">
                {currentUser.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Exploring real-time messaging...
              </p>
            </div>
          </div>

          <div className="mt-4 bg-white dark:bg-slate-800 border-y border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200">
            {/* Theme Toggle */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm font-medium">
              <span>Theme</span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="bg-slate-100 dark:bg-slate-900 border-none rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
              >
                <option value="system">System Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            {/* Enter is Send Toggle */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm font-medium">
              <span>Enter is send</span>
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={enterIsSend}
                    onChange={(e) => setEnterIsSend(e.target.checked)}
                  />
                  <div
                    className={cn(
                      "block w-10 h-6 rounded-full transition-colors",
                      enterIsSend
                        ? "bg-[#00a884]"
                        : "bg-slate-300 dark:bg-slate-600",
                    )}
                  ></div>
                  <div
                    className={cn(
                      "dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform",
                      enterIsSend ? "transform translate-x-4" : "",
                    )}
                  ></div>
                </div>
              </label>
            </div>

            {/* Privacy Select */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm font-medium">
              <span>Last Active Privacy</span>
              <select
                value={privacy}
                onChange={(e) => handlePrivacyChange(e.target.value as any)}
                className="bg-slate-100 dark:bg-slate-900 border-none rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#00a884] text-slate-700 dark:text-slate-300"
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">My Contacts</option>
                <option value="none">Nobody</option>
              </select>
            </div>

            {/* Chat Wallpaper Select */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm font-medium">
              <span>Chat Wallpaper</span>
              <select
                value={chatWallpaper}
                onChange={(e) => setChatWallpaper(e.target.value)}
                className="bg-slate-100 dark:bg-slate-900 border-none rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#00a884] text-slate-700 dark:text-slate-300"
              >
                <option value="default">Default WhatsApp</option>
                <option value="solid-dark">Solid Dark</option>
                <option value="solid-light">Solid Light</option>
                <option value="emerald">Emerald</option>
              </select>
            </div>

            {/* Export / Import Data */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm font-medium">
              <button
                onClick={handleExportData}
                className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                title="Export Profile & Chats"
              >
                <Download className="w-4 h-4" />
                <span>Export Backup</span>
              </button>
              <button
                onClick={handleImportData}
                className="flex items-center space-x-2 text-[#00a884] hover:text-[#008f6f] transition-colors"
                title="Import Backup"
              >
                <Upload className="w-4 h-4" />
                <span>Import Backup</span>
              </button>
            </div>

            {[
              "Notifications",
              "Privacy",
              "Security",
              "Request Account Info",
            ].map((item) => (
              <div
                key={item}
                className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-sm font-medium last:border-none"
                onClick={() => alert(`${item} settings coming soon!`)}
              >
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 border-y border-slate-100 dark:border-slate-700 bg-white dark:bg-[#111b21] text-slate-800 dark:text-slate-200">
            <div
              onClick={() => {
                localStorage.removeItem("whatsclone_user_real");
                onUpdateUser(null);
              }}
              className="px-6 py-4 cursor-pointer text-sm font-medium hover:bg-slate-50 dark:hover:bg-[#202c33] text-red-500"
            >
              Log out
            </div>
          </div>
        </div>
      </div>

      {/* Contacts Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-slate-50 dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          contactsVisible ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            isContactsTab
              ? "h-16 flex-none bg-slate-50 dark:bg-[#111b21] flex flex-row items-center px-4 transition-colors duration-300"
              : "h-28 bg-indigo-600 dark:bg-[#202c33] text-white flex items-end px-6 pb-4 cursor-pointer",
          )}
          onClick={() => {
            if (showContacts) setShowContacts(false);
          }}
        >
          {isContactsTab ? (
            <h1 className="text-[22px] font-bold text-slate-800 dark:text-[#e9edef]">
              Contacts
            </h1>
          ) : (
            <div className="flex items-center space-x-6 text-[#e9edef]">
              <ArrowLeft className="w-6 h-6 hover:scale-110 transition-transform" />
              <h2 className="text-[19px] font-medium">New Chat</h2>
            </div>
          )}
        </div>
        {!showAddContact ? (
          <div className="flex-1 overflow-y-auto">
            <div
              className="p-4 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center space-x-4 text-indigo-600 dark:text-indigo-400 font-bold"
              onClick={() => setShowAddContact(true)}
            >
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <span>New Chat</span>
            </div>
            <div
              className="p-4 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center space-x-4 text-indigo-600 dark:text-indigo-400 font-bold"
              onClick={() => {
                setShowNewGroup(true);
                setShowContacts(false);
              }}
            >
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <span>New Group</span>
            </div>

            <div className="py-2 px-6 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-2">
              Contacts on WhatsClone
            </div>
            {contacts.map((c) => (
              <div
                key={c.id}
                className="p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between group"
                onClick={() => handleCreateContactChat(c)}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden text-sm">
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      c.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h3
                      className={cn(
                        "font-semibold text-slate-800 dark:text-slate-200",
                        c.isBlocked &&
                          "line-through text-slate-400 dark:text-slate-600",
                      )}
                    >
                      {c.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {c.phone || "No phone"}
                    </p>
                  </div>
                </div>
                <div className="hidden group-hover:flex items-center space-x-3 text-slate-400">
                  <button
                    className="text-[10px] uppercase font-bold hover:text-red-500 transition-colors"
                    onClick={(e) => toggleBlockContact(c.id, e)}
                  >
                    {c.isBlocked ? "Unblock" : "Block"}
                  </button>
                  <button
                    className="text-[10px] uppercase font-bold hover:text-red-500 transition-colors"
                    onClick={(e) => deleteContact(c.id, e)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* New Chat Form */
          <div className="flex-1 overflow-y-auto p-6 flex flex-col bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">
                New Chat
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => refreshUserDiscovery(userSearchQuery)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 px-3 py-1.5 rounded-full transition-colors flex items-center"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh users
                </button>
                <button
                  onClick={() => setShowAddContact(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="relative mb-6">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search users by name"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {usersToChat.length === 0 ? (
              <div className="text-center text-sm text-slate-500 mt-4">
                No users found in local database. Open GlassChat on another device and register a username first.
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {/* Online Users */}
                {usersToChat.filter((u) => u.online).length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-2">
                      Online users
                    </h4>
                    <div className="space-y-1">
                      {usersToChat
                        .filter((u) => u.online)
                        .sort((a,b) => a.name.localeCompare(b.name))
                        .map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center space-x-3 p-3 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                            onClick={() => handleStartDirectChat(u.id)}
                          >
                            <div className="relative w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-700">
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt="avatar"
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <UserIcon className="w-full h-full p-2 text-slate-500" />
                              )}
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-50 dark:border-slate-900 rounded-full" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                {u.name}
                              </p>
                              {u.phone && (
                                <p className="text-xs text-slate-500">
                                  {u.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Offline Users */}
                {usersToChat.filter((u) => !u.online).length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">
                      {usersToChat.filter((u) => u.online).length > 0
                        ? "Offline users"
                        : "All users"}
                    </h4>
                    <div className="space-y-1">
                      {usersToChat
                        .filter((u) => !u.online)
                        .sort((a,b) => a.name.localeCompare(b.name))
                        .map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center space-x-3 p-3 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
                            onClick={() => handleStartDirectChat(u.id)}
                          >
                            <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-700">
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt="avatar"
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <UserIcon className="w-full h-full p-2 text-slate-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                {u.name}
                              </p>
                              {u.phone ? (
                                <p className="text-xs text-slate-500">
                                  {u.phone}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400 italic">
                                  Offline
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-4">
                Manual contact (Fallback)
              </h4>
              <form onSubmit={handleCreateContact} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
                    Name
                  </label>
                  <input
                    required
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
                    Phone / Email (Optional)
                  </label>
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. +1 555-0000"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors mt-4 text-sm"
                >
                  Save Contact
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* New Group Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-slate-50 dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showNewGroup ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className="h-28 bg-indigo-600 dark:bg-[#202c33] text-white flex items-end px-6 pb-4 cursor-pointer"
          onClick={() => setShowNewGroup(false)}
        >
          <div className="flex items-center space-x-6 text-[#e9edef]">
            <ArrowLeft className="w-6 h-6 hover:scale-110 transition-transform" />
            <h2 className="text-[19px] font-medium">Add group participants</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
          <div className="w-32 h-32 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-6 border-4 border-white dark:border-slate-900 shadow-sm cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
            <Camera className="w-10 h-10" />
          </div>
          <button
            onClick={handleCreateGroup}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <Users className="w-5 h-5" />
            <span>Create Mock Group</span>
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-6">
            This will create a group with a few of your contacts automatically.
          </p>
        </div>
      </div>

      {/* Calls Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-slate-50 dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showCalls ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-16 flex-none bg-slate-50 dark:bg-[#111b21] flex flex-row items-center px-4 transition-colors duration-300">
          <h1 className="text-[22px] font-bold text-slate-800 dark:text-[#e9edef]">
            Calls
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {callLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-[#8696a0] h-full">
              <Phone className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-600" />
              <p>No recent calls</p>
            </div>
          ) : (
            <div className="flex flex-col">
               {callLogs.map((log) => {
                 const isIncoming = log.direction
                   ? log.direction === "incoming"
                   : log.calleeId === currentUser.id;
                 const otherUser = log.otherUser;
                 const otherName = otherUser?.name || (isIncoming ? log.callerId : log.calleeId);
                 const typeLabel = log.type === "video" ? "Video" : "Audio";
                 
                 // Get display text for status/duration
                 let statusText: string = log.status;
                 if (log.status === "ended" && log.durationSeconds !== undefined && log.durationSeconds !== null) {
                    const mins = Math.floor(log.durationSeconds / 60);
                    const secs = log.durationSeconds % 60;
                    statusText = `Duration: ${mins}:${secs.toString().padStart(2, "0")}`;
                 } else if (log.status === "declined") {
                    statusText = "Call declined";
                 } else if (log.status === "missed") {
                    statusText = "Missed call";
                 } else if (log.status === "busy") {
                    statusText = "User busy";
                 } else if (log.status === "unavailable") {
                    statusText = "Unavailable";
                 }
                 const isProblemStatus = ["declined", "missed", "busy", "failed", "unavailable"].includes(log.status);

                 return (
                   <div key={log.id} className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                     <div className="w-12 h-12 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0 overflow-hidden">
                       {otherUser?.avatar ? (
                         <img src={otherUser.avatar} alt={otherName} className="w-full h-full object-cover" />
                       ) : (
                         <UserIcon className="w-6 h-6" />
                       )}
                     </div>
                     <div className="flex-1 ml-4 line-clamp-1">
                       <div className="flex items-center justify-between">
                         <h3 className={cn("font-bold text-[15px] dark:text-slate-200 text-slate-800", isProblemStatus ? "text-red-500" : "")}>
                           {otherName}
                         </h3>
                         <span className="text-xs text-slate-400">
                           {format(new Date(log.startedAt), "MMM d, HH:mm")}
                         </span>
                       </div>
                       <div className="flex items-center justify-between mt-1">
                         <div className="flex items-center space-x-2 text-sm text-slate-500">
                            {isIncoming ? (
                               <ArrowLeft className={cn("w-4 h-4", isProblemStatus ? "text-red-500" : "text-emerald-500")} />
                            ) : (
                               <ArrowLeft className={cn("w-4 h-4 rotate-180", isProblemStatus ? "text-red-500" : "text-emerald-500")} />
                            )}
                            <span className="capitalize">{typeLabel} • {statusText}</span>
                         </div>
                         <div className="flex items-center space-x-2">
                           <button onClick={async () => {
                             // Find the matching chat
                             const { fetchChats } = await import("../api");
                             const allChats = await fetchChats(currentUser.id);
                             const matchingChat = allChats.find(c => c.id === log.chatId);
                             const other = matchingChat && !matchingChat.isGroup
                               ? matchingChat.participants?.find((p: any) => p.id !== currentUser.id)
                               : undefined;
                             if (matchingChat) {
                               onSelectChat(matchingChat);
                               setTimeout(() => {
                                 window.dispatchEvent(
                                  new CustomEvent("START_CALL", {
                                    detail: {
                                      chatId: matchingChat.id,
                                      calleeId: other?.id || otherUser?.id,
                                      calleeName: other?.name || otherName,
                                      calleeAvatar: other?.avatar || otherUser?.avatar,
                                      isVideo: log.type === "video",
                                    },
                                  }),
                                );
                               }, 300);
                             }
                           }} className="text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 p-2 rounded-full transition">
                              <Phone className="w-5 h-5 fill-current" />
                           </button>
                         </div>
                       </div>
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </div>
      </div>

      {/* Status Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-white dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showStatus ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-16 flex-none bg-slate-50 dark:bg-[#111b21] flex flex-row items-center px-4 transition-colors duration-300">
          <h1 className="text-[22px] font-bold text-slate-800 dark:text-[#e9edef]">
            Status
          </h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-[#8696a0]">
          <CircleDashed className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-600" />
          <p>No recent status updates</p>
        </div>
      </div>

      {/* Communities Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-white dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showCommunities ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-16 flex-none bg-slate-50 dark:bg-[#111b21] flex flex-row items-center px-4 transition-colors duration-300">
          <h1 className="text-[22px] font-bold text-slate-800 dark:text-[#e9edef]">
            Communities
          </h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-[#8696a0]">
          <Users className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-600" />
          <p>Introducing communities</p>
        </div>
      </div>

      {/* Starred Pane */}
      <div
        className={cn(
          "absolute inset-0 bg-white dark:bg-[#111b21] z-20 flex flex-col transition-transform duration-300 transform",
          showStarred ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className="h-28 bg-indigo-600 dark:bg-[#202c33] text-white flex items-end px-6 pb-4 cursor-pointer"
          onClick={() => setActiveRailTab("chats")}
        >
          <div className="flex items-center space-x-6 text-[#e9edef]">
            <ArrowLeft className="w-6 h-6 hover:scale-110 transition-transform" />
            <h2 className="text-[19px] font-medium">Starred messages</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#111b21]">
          {starredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-[#8696a0] h-full">
              <div className="w-24 h-24 bg-slate-200 dark:bg-[#202c33] rounded-full flex items-center justify-center mb-6">
                <Star className="w-10 h-10 text-slate-400 dark:text-[#8696a0] fill-current" />
              </div>
              <p className="text-sm">No starred messages</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {starredMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-white dark:bg-[#202c33] p-3 rounded-lg shadow-sm border border-slate-200 dark:border-[#2f3b43]"
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-slate-800 dark:text-[#e9edef] text-sm">
                        {msg.senderName}
                      </span>
                      <span className="text-slate-500 dark:text-[#8696a0] text-xs">
                        &rarr; You
                      </span>
                    </div>
                    <span className="text-slate-500 dark:text-[#8696a0] text-xs">
                      {format(new Date(msg.timestamp), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-[#d1d7db] text-sm">
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
