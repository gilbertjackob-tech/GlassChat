/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from "react";
import { SocketProvider } from "./SocketContext";
import { Sidebar } from "./components/Sidebar";
import { ChatWindow } from "./components/ChatWindow";
import { CallOverlay } from "./components/CallOverlay";
import { AuthScreen } from "./components/AuthScreen";
import { Chat, User } from "./types";
import { ThemeProvider } from "./ThemeContext";
import { NotificationProvider } from "./NotificationContext";
import { cn } from "./lib/utils";
import { API_BASE } from "./api";
import {
  Menu,
  ArrowLeft,
  MessageSquare,
  Phone,
  CircleDashed,
  Users,
  Settings,
  UserCircle2,
} from "lucide-react";
import { PermissionsModal } from "./components/PermissionsModal";

export default function App() {
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("whatsclone_user_real");
    return saved ? JSON.parse(saved) : null;
  });

  const [hasRequestedPermissions, setHasRequestedPermissions] = useState(() => {
    return localStorage.getItem("whatsclone_permissions") === "true";
  });

  const [activeRailTab, setActiveRailTab] = useState<string>("chats");

  useEffect(() => {
    if (!currentUser) {
      localStorage.removeItem("whatsclone_user_real");
      return;
    }

    localStorage.setItem("whatsclone_user_real", JSON.stringify(currentUser));

    let cancelled = false;

    async function validateCurrentUser() {
      try {
        const res = await fetch(`${API_BASE}/users/${currentUser.id}`);

        if (cancelled) return;

        if (res.status === 404) {
          localStorage.removeItem("whatsclone_user_real");
          setCurrentUser(null);
          return;
        }

        if (!res.ok) {
          console.error("Failed to validate current user", res.status);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to validate current user", err);
        }
      }
    }

    validateCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  if (!currentUser) {
    return <AuthScreen onAuthSuccess={setCurrentUser} />;
  }

  return (
    <ThemeProvider>
      <SocketProvider currentUser={currentUser}>
        <NotificationProvider currentUser={currentUser}>
        {currentUser && !hasRequestedPermissions && (
          <PermissionsModal
            onDone={() => {
              localStorage.setItem("whatsclone_permissions", "true");
              setHasRequestedPermissions(true);
            }}
          />
        )}
        <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-slate-100 dark:bg-[#0b141a] text-slate-800 dark:text-[#e9edef] font-sans overflow-hidden relative transition-colors duration-300">
          <CallOverlay currentUser={currentUser} />

          {/* Global Navigation (Bottom on Mobile, Left Rail on Desktop) */}
          <div
            className={cn(
              "bg-slate-50 dark:bg-[#202c33] z-30 transition-colors duration-300 flex-shrink-0 flex order-3 md:order-1",
              "md:w-[60px] md:h-full md:flex-col md:items-center md:py-4 md:border-r md:border-slate-200 dark:border-[#2f3b43]",
              "w-full h-[60px] flex-row items-center px-2 border-t border-slate-200 dark:border-[#2f3b43]",
              activeChat ? "hidden md:flex" : "flex",
            )}
          >
            <div className="flex md:flex-col gap-1 sm:gap-2 md:gap-4 w-full h-full justify-around md:justify-start items-center text-slate-500 dark:text-[#aebac1]">
              <button
                onClick={() => setActiveRailTab("chats")}
                className={cn(
                  "p-2 rounded-full relative transition-colors",
                  activeRailTab === "chats"
                    ? "bg-slate-200 dark:bg-[#374248] text-slate-800 dark:text-[#e9edef]"
                    : "hover:bg-slate-200 dark:hover:bg-[#374248]",
                )}
              >
                <MessageSquare className="w-5 sm:w-6 h-5 sm:h-6 fill-transparent stroke-current dark:text-[#e9edef]" />
                <span className="absolute top-1 right-1 bg-emerald-500 text-white text-[9px] sm:text-[10px] w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full flex items-center justify-center font-bold">
                  25
                </span>
              </button>

              <button
                onClick={() => setActiveRailTab("calls")}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  activeRailTab === "calls"
                    ? "bg-slate-200 dark:bg-[#374248] text-slate-800 dark:text-[#e9edef]"
                    : "hover:bg-slate-200 dark:hover:bg-[#374248]",
                )}
              >
                <Phone className="w-5 sm:w-6 h-5 sm:h-6" />
              </button>

              <button
                onClick={() => setActiveRailTab("status")}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  activeRailTab === "status"
                    ? "bg-slate-200 dark:bg-[#374248] text-slate-800 dark:text-[#e9edef]"
                    : "hover:bg-slate-200 dark:hover:bg-[#374248]",
                )}
                title="Status"
              >
                <CircleDashed className="w-5 sm:w-6 h-5 sm:h-6" />
              </button>

              <button
                onClick={() => setActiveRailTab("contacts")}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  activeRailTab === "contacts"
                    ? "bg-slate-200 dark:bg-[#374248] text-slate-800 dark:text-[#e9edef]"
                    : "hover:bg-slate-200 dark:hover:bg-[#374248]",
                )}
                title="Contacts"
              >
                <UserCircle2 className="w-5 sm:w-6 h-5 sm:h-6" />
              </button>

              <button
                onClick={() => setActiveRailTab("communities")}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  activeRailTab === "communities"
                    ? "bg-slate-200 dark:bg-[#374248] text-slate-800 dark:text-[#e9edef]"
                    : "hover:bg-slate-200 dark:hover:bg-[#374248]",
                )}
                title="Communities"
              >
                <Users className="w-5 sm:w-6 h-5 sm:h-6" />
              </button>

              <div className="hidden md:block flex-1"></div>

              <button
                onClick={() => setActiveRailTab("settings")}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  activeRailTab === "settings"
                    ? "bg-slate-200 dark:bg-[#374248] text-slate-800 dark:text-[#e9edef]"
                    : "hover:bg-slate-200 dark:hover:bg-[#374248]",
                )}
              >
                <Settings className="w-5 sm:w-6 h-5 sm:h-6" />
              </button>

              <button
                onClick={() => setActiveRailTab("profile")}
                className={cn(
                  "w-7 sm:w-8 h-7 sm:h-8 rounded-full overflow-hidden border-2 cursor-pointer transition-colors md:mt-2 shrink-0",
                  activeRailTab === "profile"
                    ? "border-[#00a884]"
                    : "border-transparent hover:border-slate-300 dark:hover:border-slate-500",
                )}
              >
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt="Me"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCircle2 className="w-full h-full" />
                )}
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div
            className={cn(
              "bg-white dark:bg-[#111b21] md:border-r border-slate-200 dark:border-[#2f3b43] flex flex-col transition-all duration-300 z-20 order-1 md:order-2",
              !activeChat
                ? "flex-1 w-full min-h-0 md:h-full md:w-[350px] md:flex-none"
                : "hidden md:flex md:w-[350px] md:h-full md:flex-none",
              !isSidebarOpen && "md:w-0 md:hidden",
            )}
          >
            <Sidebar
              activeChatId={activeChat?.id}
              onSelectChat={setActiveChat}
              currentUser={currentUser}
              onUpdateUser={setCurrentUser}
              activeRailTab={activeRailTab}
              setActiveRailTab={setActiveRailTab}
            />
          </div>

          {/* Main Chat Area */}
          <div
            className={cn(
              "flex flex-col bg-[#EFEAE2] dark:bg-[#0b141a] relative h-full overflow-hidden transition-colors duration-300 order-2 md:order-3 flex-1",
              !activeChat && "hidden md:flex",
            )}
          >
            {/* Minimal top bar when sidebar is collapsed on desktop, or mobile back button */}
            {activeChat && (
              <div className="absolute top-3 left-4 z-50 md:hidden">
                <button
                  onClick={() => setActiveChat(null)}
                  className="w-10 h-10 rounded-full bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] flex items-center justify-center shadow-md"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Desktop menu toggle (floating when closed) */}
            {!isSidebarOpen && (
              <div className="absolute top-3 left-4 z-50 hidden md:flex">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="w-10 h-10 rounded-full bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] flex items-center justify-center shadow-md hover:bg-slate-50 dark:hover:bg-[#374248] transition"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </div>
            )}

            {activeChat ? (
              <ChatWindow
                key={activeChat.id}
                chat={activeChat}
                currentUser={currentUser}
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                isSidebarOpen={isSidebarOpen}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 dark:bg-[#222e35] transition-colors duration-300 relative border-b-4 border-emerald-500">
                {/* When no chat is active, we STILL need to toggle sidebar on desktop if they collapse it */}
                {!isSidebarOpen && (
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] flex items-center justify-center shadow-md hover:bg-slate-50 dark:hover:bg-[#374248] transition z-50"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}

                <div className="rounded-full h-64 w-64 flex items-center justify-center mb-8 transition-colors duration-300">
                  <svg
                    viewBox="0 0 100 100"
                    width="100"
                    height="100"
                    className="text-gray-300 dark:text-[#41525d]"
                  >
                    <path
                      fill="currentColor"
                      d="M50,10A40,40,0,1,0,90,50,40.045,40.045,0,0,0,50,10ZM50,85A35,35,0,1,1,85,50,35.039,35.039,0,0,1,50,85Z"
                    ></path>
                  </svg>
                </div>
                <h2 className="text-[#41525d] dark:text-[#e9edef] text-3xl font-light">
                  WhatsClone Web
                </h2>
                <p className="text-[#8696a0] dark:text-[#8696a0] mt-4 text-sm max-w-sm text-center">
                  Select a chat to begin messaging. Use the API or CLI to
                  interact magically!
                </p>
              </div>
            )}
          </div>
        </div>
        </NotificationProvider>
      </SocketProvider>
    </ThemeProvider>
  );
}
