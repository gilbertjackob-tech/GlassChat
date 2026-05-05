export interface Reaction {
  emoji: string;
  userId: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  phone?: string;
  email?: string;
  online?: boolean;
  lastActive?: number;
  securityQuestion?: string;
  securityAnswer?: string;
}

export interface Contact {
  id: string;
  name: string;
  avatar?: string;
  phone?: string;
  isBlocked?: boolean;
}

export interface Chat {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
  isGroup?: boolean;
  members?: string[];
  participants?: User[];
  deletedFor?: string[];
}

export interface LocationData {
  lat: number;
  lng: number;
  isLive?: boolean;
  expiresAt?: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: number;
  reactions?: Reaction[];
  attachmentUrl?: string;
  attachmentType?: "image" | "file" | "audio";
  attachmentName?: string;
  attachmentSize?: number;
  status?: "sent" | "delivered" | "read";
  starredBy?: string[];
  pinnedUntil?: number;
  isDeleted?: boolean;
  deletedFor?: string[];
  location?: LocationData;
  replyTo?: { id: string; text: string; senderName: string; senderId?: string };
}
