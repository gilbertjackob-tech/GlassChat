import express from "express";
import { createServer as createViteServer } from "vite";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import path from "path";
import fs from "fs";

// Define Data Models
interface UserRecord {
  id: string;
  name: string;
  securityQuestion?: string;
  securityAnswer?: string;
  avatar?: string;
  phone?: string;
  lastActive?: number;
  lastActivePrivacy?: "none" | "contacts" | "everyone";
}

interface Chat {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
  isGroup?: boolean;
  members?: string[];
  deletedFor?: string[];
}

interface Reaction {
  emoji: string;
  userId: string;
}

interface LocationData {
  lat: number;
  lng: number;
  isLive?: boolean;
  expiresAt?: number;
}

interface Message {
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
  status?: "sent" | "delivered" | "read";
  starredBy?: string[];
  pinnedUntil?: number;
  isDeleted?: boolean;
  deletedFor?: string[];
  location?: LocationData;
  replyTo?: { id: string; text: string; senderName: string; senderId?: string };
}

// In-memory Database
let users: UserRecord[] = [];

let chats: Chat[] = [
  {
    id: "1",
    name: "General Chat",
    lastMessage: "Welcome to WhatsClone",
    lastMessageTime: Date.now(),
    unreadCount: 0,
  },
  {
    id: "2",
    name: "CLI Bot",
    lastMessage: "Use the API to send messages here",
    lastMessageTime: Date.now(),
    unreadCount: 0,
  },
];

let messages: Message[] = [
  {
    id: "msg_1",
    chatId: "1",
    senderId: "system",
    senderName: "System",
    text: "Welcome to WhatsClone!",
    timestamp: Date.now() - 10000,
    status: "read",
  },
  {
    id: "msg_2",
    chatId: "2",
    senderId: "cli-bot",
    senderName: "CLI Bot",
    text: "You can hit the API at POST /api/chats/2/messages",
    timestamp: Date.now() - 5000,
    status: "read",
  },
];

const DATA_FILE = path.join(process.cwd(), "local_db.json");

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (data.users) users = data.users;
      if (data.chats) chats = data.chats;
      if (data.messages) messages = data.messages;
    } catch (e) {
      console.error("Error reading local_db.json", e);
    }
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ users, chats, messages }, null, 2),
    );
  } catch (e) {
    console.error("Error saving local_db.json", e);
  }
}

loadData();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use built-in JSON parser with larger limit for files
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Create uploads directory if not exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  app.use("/uploads", express.static(uploadsDir));

  const httpServer = createServer(app);

  // Setup Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const connectedSockets = new Map<string, string>();

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Identify user
    socket.on("identify", (userId: string) => {
      connectedSockets.set(socket.id, userId);
      const user = users.find((u) => u.id === userId);
      if (user) {
        user.lastActive = Date.now();
        // Since we don't know if they were already online from another tab, emit anyway
        io.emit("presence_updated", { userId, online: true, lastActive: user.lastActive, privacy: user.lastActivePrivacy || "everyone" });

        // Update any sent messages to delivered for chats this user is a member of
        let requiresSave = false;
        messages.forEach((m) => {
          if (m.status === "sent" && m.senderId !== userId) {
            const chat = chats.find(c => c.id === m.chatId);
            if (chat && (chat.members?.includes(userId) || chat.id === "global")) {
              m.status = "delivered";
              requiresSave = true;
              io.to(m.chatId).emit("message_updated", m);
            }
          }
        });
        if (requiresSave) saveData();
      }
    });

    // Client can join specific chat rooms to receive messages
    socket.on("join_chat", (chatId: string) => {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat ${chatId}`);
    });

    socket.on("leave_chat", (chatId: string) => {
      socket.leave(chatId);
      console.log(`Socket ${socket.id} left chat ${chatId}`);
    });

    // Handle typing indicator
    socket.on(
      "typing",
      (data: { chatId: string; senderName: string; isTyping?: boolean }) => {
        socket.to(data.chatId).emit("user_typing", data);
      },
    );

    // WebRTC Signaling
    socket.on("call_user", (data) => {
      // broadcast the incoming call to the specific chat room
      socket.to(data.chatId).emit("incoming_call", data);
    });

    socket.on("answer_call", (data) => {
      socket.to(data.chatId).emit("call_answered", data);
    });

    socket.on("ice_candidate", (data) => {
      socket.to(data.chatId).emit("ice_candidate", data);
    });

    socket.on("end_call", (data) => {
      socket.to(data.chatId).emit("call_ended", data);
    });

    socket.on(
      "mark_messages_read",
      (data: { chatId: string; readerId: string }) => {
        let requiresSave = false;
        messages.forEach((m) => {
          if (
            m.chatId === data.chatId &&
            m.senderId !== data.readerId &&
            m.status !== "read"
          ) {
            m.status = "read";
            requiresSave = true;
            io.to(data.chatId).emit("message_updated", m);
          }
        });
        if (requiresSave) saveData();
      },
    );

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      const userId = connectedSockets.get(socket.id);
      if (userId) {
        connectedSockets.delete(socket.id);
        const isStillOnline = Array.from(connectedSockets.values()).includes(userId);
        if (!isStillOnline) {
          const user = users.find((u) => u.id === userId);
          if (user) {
            user.lastActive = Date.now();
            saveData();
            io.emit("presence_updated", { userId, online: false, lastActive: user.lastActive, privacy: user.lastActivePrivacy || "everyone" });
          }
        }
      }
    });
  });

  app.get("/api/chats/messages/starred", (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: "userId query param is required" });
      return;
    }
    const starredMessages = messages.filter(
      (m) => m.starredBy && m.starredBy.includes(String(userId)),
    );
    res.json(starredMessages);
  });

  app.get("/api/users/:userId", (req, res) => {
    const userId = req.params.userId;
    const user = users.find(u => u.id === userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const isOnline = Array.from(connectedSockets.values()).includes(userId);
    res.json({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        lastActive: user.lastActive,
        online: isOnline,
        privacy: user.lastActivePrivacy || "everyone"
    });
  });

  app.post("/api/users/:userId/privacy", (req, res) => {
    const userId = req.params.userId;
    const { lastActivePrivacy } = req.body;
    const user = users.find((u) => u.id === userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (lastActivePrivacy) {
      user.lastActivePrivacy = lastActivePrivacy;
      saveData();
      const isOnline = Array.from(connectedSockets.values()).includes(userId);
      io.emit("presence_updated", { userId, online: isOnline, lastActive: user.lastActive, privacy: user.lastActivePrivacy });
      res.json(user);
    } else {
      res.status(400).json({ error: "Invalid payload" });
    }
  });

  app.post("/api/users/:userId/contacts", (req, res) => {
     // Optional endpoint to add/manage contacts if needed
  });

  app.post("/api/export", (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const user = users.find((u) => u.id === userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userChats = chats.filter(
      (c) => c.members?.includes(userId) || c.id === "global",
    );
    const userChatIds = userChats.map((c) => c.id);
    const userMessages = messages.filter((m) => userChatIds.includes(m.chatId));

    res.json({
      user,
      chats: userChats,
      messages: userMessages,
    });
  });

  app.post("/api/import", (req, res) => {
    const { userId, data } = req.body;
    if (!userId || !data || !data.user) {
      res.status(400).json({ error: "Invalid import data format" });
      return;
    }

    // Replace user details (including password)
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex !== -1) {
      // Don't change ID, but update other fields
      users[userIndex] = { ...users[userIndex], ...data.user, id: userId };
    }

    // Merge chats
    if (data.chats && Array.isArray(data.chats)) {
      data.chats.forEach((inChat: any) => {
        const existingIdx = chats.findIndex((c) => c.id === inChat.id);
        if (existingIdx !== -1) {
          chats[existingIdx] = { ...chats[existingIdx], ...inChat };
        } else {
          chats.push(inChat);
        }
      });
    }

    // Merge messages
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((inMsg: any) => {
        const existingIdx = messages.findIndex((m) => m.id === inMsg.id);
        if (existingIdx !== -1) {
          messages[existingIdx] = { ...messages[existingIdx], ...inMsg };
        } else {
          messages.push(inMsg);
        }
      });
    }

    saveData();
    res.json({ success: true });
  });

  // Auth Routes
  app.post("/api/register", (req, res) => {
    const { name, securityQuestion, securityAnswer } = req.body;
    if (!name || !securityQuestion || !securityAnswer) {
      res.status(400).json({
        error: "Username, security question, and answer are required",
      });
      return;
    }
    const existing = users.find(
      (u) => u.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }
    const newUser: UserRecord = {
      id: "usr_" + Math.random().toString(36).substr(2, 9),
      name,
      securityQuestion,
      securityAnswer,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
    };
    users.push(newUser);
    saveData();
    const { securityAnswer: _a, ...safeUser } = newUser;
    res.status(201).json(safeUser);
  });

  app.get("/api/user-question", (req, res) => {
    const { name } = req.query;
    if (!name) {
      res.status(400).json({ error: "Username is required" });
      return;
    }
    const user = users.find(
      (u) => u.name.toLowerCase() === (name as string).toLowerCase(),
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ securityQuestion: user.securityQuestion });
  });

  app.post("/api/login", (req, res) => {
    const { name, securityAnswer } = req.body;
    const user = users.find(
      (u) =>
        u.name.toLowerCase() === name.toLowerCase() &&
        u.securityAnswer?.toLowerCase() === securityAnswer.toLowerCase(),
    );
    if (!user) {
      res.status(401).json({ error: "Incorrect answer" });
      return;
    }
    const { securityAnswer: _a, ...safeUser } = user;
    res.json(safeUser);
  });

  // 1. Get all chats
  app.get("/api/chats", (req, res) => {
    res.json(chats);
  });

  // 2. Get messages for a chat
  app.get("/api/chats/:chatId/messages", (req, res) => {
    const chatId = req.params.chatId;
    const chatMessages = messages.filter((m) => m.chatId === chatId);
    res.json(chatMessages);
  });

  // 3. Send a message via API (This allows CLI and API integrations)
  app.post("/api/chats/:chatId/messages", (req, res) => {
    const chatId = req.params.chatId;
    let {
      senderId,
      senderName,
      senderAvatar,
      text,
      attachmentUrl,
      attachmentType,
      location,
      replyTo,
    } = req.body;

    if ((!text || text.trim() === "") && !attachmentUrl && !location) {
      res
        .status(400)
        .json({ error: "Message text, attachment, or location is required" });
      return;
    }

    const chat = chats.find((c) => c.id === chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    // Handle base64 attachment extraction to filesystem
    if (attachmentUrl && attachmentUrl.startsWith("data:")) {
      try {
        const matches = attachmentUrl.match(
          /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/,
        );
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const extension = mimeType.split("/")[1] || "bin";
          const filename = `file_${Date.now()}_${Math.random().toString(36).substring(2)}.${extension}`;
          const filepath = path.join(process.cwd(), "uploads", filename);
          fs.writeFileSync(filepath, base64Data, "base64");
          attachmentUrl = `/uploads/${filename}`;
        }
      } catch (e) {
        console.error("Failed to save base64 attachment", e);
      }
    }

    const newMessage: Message = {
      id: "msg_" + Math.random().toString(36).substr(2, 9),
      chatId,
      senderId: senderId || "api-user",
      senderName: senderName || "API User",
      senderAvatar,
      text: text || (location ? "📍 Location shared" : ""),
      timestamp: Date.now(),
      reactions: [],
      attachmentUrl,
      attachmentType,
      status: "sent",
      location,
      replyTo,
    };

    // Save message
    messages.push(newMessage);

    // Update chat metadata
    chat.lastMessage = text || (location ? "📍 Location" : "");
    chat.lastMessageTime = newMessage.timestamp;

    saveData();

    // Broadcast message via Socket.IO
    // Emit to specific room for real-time update
    io.to(chatId).emit("receive_message", newMessage);

    // Emit globally for chat list updates
    io.emit("chat_updated", chat);

    // Check if any other chat member is online
    const onlineOthers = chat.members?.filter(
      (m) => m !== senderId && Array.from(connectedSockets.values()).includes(m)
    ) || [];

    if (onlineOthers.length > 0 || (chat.id === "global" && connectedSockets.size > 1)) {
        const msg = messages.find((m) => m.id === newMessage.id);
        if (msg && msg.status === "sent") {
            msg.status = "delivered";
            io.to(chatId).emit("message_updated", msg);
        }
    }

    res.status(201).json(newMessage);
  });

  app.put("/api/chats/:chatId/messages/:messageId/location", (req, res) => {
    const { chatId, messageId } = req.params;
    const { lat, lng } = req.body;

    const message = messages.find(
      (m) => m.id === messageId && m.chatId === chatId,
    );
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (message.location && message.location.isLive) {
      if (
        message.location.expiresAt &&
        message.location.expiresAt < Date.now()
      ) {
        res.status(400).json({ error: "Live location has expired" });
        return;
      }
      message.location.lat = lat;
      message.location.lng = lng;
      saveData();
      io.to(chatId).emit("message_updated", message);
      res.json(message);
    } else {
      res.status(400).json({ error: "Not a live location message" });
    }
  });

  // 4. Create a new chat or group
  app.post("/api/chats", (req, res) => {
    const { name, isGroup, members } = req.body;
    if (!name) {
      res.status(400).json({ error: "Chat name is required" });
      return;
    }

    const newChat: Chat = {
      id: "chat_" + Math.random().toString(36).substr(2, 9),
      name,
      lastMessage: "",
      lastMessageTime: Date.now(),
      unreadCount: 0,
      isGroup: isGroup || false,
      members: members || [],
    };

    chats.push(newChat);
    saveData();
    io.emit("new_chat", newChat);

    res.status(201).json(newChat);
  });

  // 5. Add a reaction
  app.post("/api/chats/:chatId/messages/:messageId/react", (req, res) => {
    const { chatId, messageId } = req.params;
    const { emoji, userId } = req.body;

    if (!emoji || !userId) {
      res.status(400).json({ error: "Emoji and userId are required" });
      return;
    }

    const message = messages.find(
      (m) => m.id === messageId && m.chatId === chatId,
    );
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (!message.reactions) message.reactions = [];

    // Toggle reaction logic
    const existingIdx = message.reactions.findIndex(
      (r) => r.userId === userId && r.emoji === emoji,
    );
    if (existingIdx !== -1) {
      message.reactions.splice(existingIdx, 1);
    } else {
      message.reactions.push({ emoji, userId });
    }

    saveData();

    io.to(chatId).emit("message_updated", message);
    res.json(message);
  });

  app.post("/api/chats/:chatId/messages/:messageId/star", (req, res) => {
    const { chatId, messageId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const message = messages.find(
      (m) => m.id === messageId && m.chatId === chatId,
    );
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (!message.starredBy) {
      message.starredBy = [];
    }

    const index = message.starredBy.indexOf(userId);
    if (index > -1) {
      message.starredBy.splice(index, 1);
    } else {
      message.starredBy.push(userId);
    }

    saveData();

    io.to(chatId).emit("message_updated", message);
    res.json(message);
  });

  app.post("/api/chats/:chatId/messages/:messageId/pin", (req, res) => {
    const { chatId, messageId } = req.params;
    const { durationDays } = req.body;

    if (durationDays === undefined) {
      res.status(400).json({ error: "durationDays is required" });
      return;
    }

    const message = messages.find(
      (m) => m.id === messageId && m.chatId === chatId,
    );
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (durationDays === 0) {
      message.pinnedUntil = undefined;
    } else {
      message.pinnedUntil = Date.now() + durationDays * 24 * 60 * 60 * 1000;
    }

    saveData();

    io.to(chatId).emit("message_updated", message);
    res.json(message);
  });

  app.delete("/api/chats/:chatId/messages/:messageId", (req, res) => {
    const { chatId, messageId } = req.params;
    const { userId, type } = req.body;

    if (!userId || !type) {
      res.status(400).json({ error: "userId and type are required" });
      return;
    }

    const message = messages.find(
      (m) => m.id === messageId && m.chatId === chatId,
    );
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (type === "for_everyone") {
      if (message.senderId !== userId) {
        res
          .status(403)
          .json({ error: "Can only delete own messages for everyone" });
        return;
      }

      // Remove attachment file if it exists
      if (
        message.attachmentUrl &&
        message.attachmentUrl.startsWith("/uploads/")
      ) {
        try {
          const filepath = path.join(process.cwd(), message.attachmentUrl);
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
        } catch (e) {
          console.error("Failed to delete attachment: ", e);
        }
      }

      message.isDeleted = true;
      message.text = "This message was deleted";
      message.attachmentUrl = undefined;
      message.attachmentType = undefined;

      saveData();
      io.to(chatId).emit("message_updated", message);
      res.json(message);
    } else if (type === "for_me") {
      if (!message.deletedFor) message.deletedFor = [];
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
      }
      saveData();
      // Client handles state updates
      res.json(message);
    } else {
      res.status(400).json({ error: "Invalid type" });
    }
  });

  app.delete("/api/chats/:chatId", (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const chat = chats.find((c) => c.id === chatId);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    if (!chat.deletedFor) chat.deletedFor = [];
    if (!chat.deletedFor.includes(userId)) {
      chat.deletedFor.push(userId);
    }

    saveData();
    res.json(chat);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
