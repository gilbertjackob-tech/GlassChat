import { Chat, Message } from "./types";

// The API url is the same origin since we run Express on port 3000
const API_BASE = "/api";

export async function updateUserPrivacy(userId: string, lastActivePrivacy: "none" | "contacts" | "everyone"): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${userId}/privacy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastActivePrivacy }),
  });
  if (!res.ok) throw new Error("Failed to update privacy");
}

export async function fetchUserPresence(userId: string): Promise<{
  id: string;
  name: string;
  avatar: string;
  lastActive?: number;
  online: boolean;
  privacy: "none" | "contacts" | "everyone";
}> {
  const res = await fetch(`${API_BASE}/users/${userId}`);
  if (!res.ok) throw new Error("Failed to fetch user presence");
  return res.json();
}

export async function fetchChats(): Promise<Chat[]> {
  const res = await fetch(`${API_BASE}/chats`);
  if (!res.ok) throw new Error("Failed to fetch chats");
  return res.json();
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`);
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

export async function fetchStarredMessages(userId: string): Promise<Message[]> {
  const res = await fetch(
    `${API_BASE}/chats/messages/starred?userId=${encodeURIComponent(userId)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch starred messages");
  return res.json();
}

export async function sendMessage(
  chatId: string,
  text: string,
  attachmentUrl?: string,
  attachmentType?: "image" | "file" | "audio",
  senderId = "local-user",
  senderName = "Me",
  senderAvatar?: string,
  location?: any,
  replyTo?: { id: string; text: string; senderName: string; senderId?: string }
): Promise<Message> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      attachmentUrl,
      attachmentType,
      senderId,
      senderName,
      senderAvatar,
      location,
      replyTo,
    }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

export async function updateLiveLocation(
  chatId: string,
  messageId: string,
  lat: number,
  lng: number,
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/chats/${chatId}/messages/${messageId}/location`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    },
  );
  if (!res.ok) throw new Error("Failed to update live location");
  return res.json();
}

export async function createChat(
  name: string,
  isGroup?: boolean,
  members?: string[],
): Promise<Chat> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, isGroup, members }),
  });
  if (!res.ok) throw new Error("Failed to create chat");
  return res.json();
}

export async function reactToMessage(
  chatId: string,
  messageId: string,
  emoji: string,
  userId: string,
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/chats/${chatId}/messages/${messageId}/react`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji, userId }),
    },
  );
  if (!res.ok) throw new Error("Failed to react to message");
  return res.json();
}

export async function starMessage(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/chats/${chatId}/messages/${messageId}/star`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    },
  );
  if (!res.ok) throw new Error("Failed to star message");
  return res.json();
}

export async function pinMessage(
  chatId: string,
  messageId: string,
  durationDays: number,
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/chats/${chatId}/messages/${messageId}/pin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationDays }),
    },
  );
  if (!res.ok) throw new Error("Failed to pin message");
  return res.json();
}

export async function deleteMessage(
  chatId: string,
  messageId: string,
  userId: string,
  type: "for_me" | "for_everyone",
): Promise<Message> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, type }),
  });
  if (!res.ok) throw new Error("Failed to delete message");
  return res.json();
}

export async function deleteChat(
  chatId: string,
  userId: string,
): Promise<Chat> {
  const res = await fetch(`${API_BASE}/chats/${chatId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to delete chat");
  return res.json();
}
