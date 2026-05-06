import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSocket } from "./SocketContext";
import { Message, CallData, User } from "./types";

interface NotificationContextType {
  notificationsEnabled: boolean;
  requestPermission: () => Promise<void>;
  toggleNotifications: (enabled: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notificationsEnabled: false,
  requestPermission: async () => {},
  toggleNotifications: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children, currentUser }: { children: ReactNode; currentUser: User | null }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem("whatsclone_notifications") === "true";
  });
  const { socket } = useSocket();

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted" && localStorage.getItem("whatsclone_notifications") === null) {
        setNotificationsEnabled(true);
      } else if (Notification.permission === "denied") {
        setNotificationsEnabled(false);
      }
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission();
      const enabled = permission === "granted";
      setNotificationsEnabled(enabled);
      localStorage.setItem("whatsclone_notifications", String(enabled));
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") {
      await requestPermission();
    } else {
      setNotificationsEnabled(enabled);
      localStorage.setItem("whatsclone_notifications", String(enabled));
    }
  };

  useEffect(() => {
    if (!socket || !notificationsEnabled || !currentUser) return;

    const notify = (title: string, options?: NotificationOptions) => {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        if (document.hidden) {
          new Notification(title, {
            icon: '/whatsapp.png',
            ...options
          });
        }
      }
    };

    const notifyUrgent = (title: string, options?: NotificationOptions) => {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
          icon: '/whatsapp.png',
          requireInteraction: true,
          ...options
        });
      }
    };

    const handleNewMessage = (msg: Message) => {
      if (msg.senderId !== currentUser.id) {
        notify(`New message from ${msg.senderName || "Unknown"}`, {
          body: msg.text || (msg.attachmentUrl ? `Sent a ${msg.attachmentType?.split('/')[0]}` : "New message"),
          tag: `chat-${msg.chatId}`,
        });
      }
    };

    const handleIncomingCall = (call: CallData) => {
      if (call.calleeId === currentUser.id) {
        notifyUrgent(`Incoming ${call.isVideo ? "video " : ""}call from ${call.callerName || "Someone"}`, {
          body: "Click to answer",
          tag: `call-${call.callId}`,
        });
      }
    };

    const handleStatusAdded = (data: { userId: string, id: string, userName: string }) => {
      if (data.userId !== currentUser.id) {
        notify(`${data.userName} added a new status update`, {
           tag: "status-update"
        });
      }
    };

    socket.on("receive_message", handleNewMessage);
    socket.on("call:start", handleIncomingCall);
    socket.on("status_added", handleStatusAdded);

    return () => {
      socket.off("receive_message", handleNewMessage);
      socket.off("call:start", handleIncomingCall);
      socket.off("status_added", handleStatusAdded);
    };
  }, [socket, currentUser, notificationsEnabled]);

  return (
    <NotificationContext.Provider value={{ notificationsEnabled, requestPermission, toggleNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}
