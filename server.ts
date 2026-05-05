import express from "express";
import { createServer as createViteServer } from "vite";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import multer from "multer";
import cors from "cors";

// Environment variables
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// Ensure directories exist
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Database setup
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    securityQuestion TEXT,
    securityAnswer TEXT,
    avatar TEXT,
    phone TEXT,
    lastActive INTEGER,
    lastActivePrivacy TEXT
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT,
    avatar TEXT,
    lastMessage TEXT,
    lastMessageTime INTEGER,
    unreadCount INTEGER,
    isGroup INTEGER
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chatId TEXT,
    userId TEXT,
    PRIMARY KEY (chatId, userId)
  );
  
  CREATE TABLE IF NOT EXISTS chat_deleted_for (
    chatId TEXT,
    userId TEXT,
    PRIMARY KEY (chatId, userId)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chatId TEXT,
    senderId TEXT,
    senderName TEXT,
    senderAvatar TEXT,
    text TEXT,
    timestamp INTEGER,
    attachmentUrl TEXT,
    attachmentType TEXT,
    attachmentName TEXT,
    attachmentSize INTEGER,
    status TEXT,
    pinnedUntil INTEGER,
    isDeleted INTEGER,
    location TEXT,
    replyTo TEXT
  );

  CREATE TABLE IF NOT EXISTS reactions (
    messageId TEXT,
    emoji TEXT,
    userId TEXT,
    PRIMARY KEY (messageId, emoji, userId)
  );

  CREATE TABLE IF NOT EXISTS message_starred_by (
    messageId TEXT,
    userId TEXT,
    PRIMARY KEY (messageId, userId)
  );

  CREATE TABLE IF NOT EXISTS message_deleted_for (
    messageId TEXT,
    userId TEXT,
    PRIMARY KEY (messageId, userId)
  );

  CREATE TABLE IF NOT EXISTS file_attachments (
    fileId TEXT PRIMARY KEY,
    originalName TEXT,
    storedName TEXT,
    mimeType TEXT,
    size INTEGER,
    path TEXT,
    uploaderId TEXT,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    callerId TEXT,
    calleeId TEXT,
    chatId TEXT,
    type TEXT,
    status TEXT,
    startedAt INTEGER,
    answeredAt INTEGER,
    endedAt INTEGER,
    durationSeconds INTEGER
  );
`);

// Helper to sanitize filenames
function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_");
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${safeName}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

const connectedSockets = new Map<string, string>();

function loadChats() {
  const chats = db.prepare("SELECT * FROM chats").all() as any[];
  const allUsers = db.prepare("SELECT id, name, avatar, phone, email, lastActive FROM users").all() as any[];
  
  for (const chat of chats) {
    chat.isGroup = !!chat.isGroup;
    
    // Get member user IDs
    const memberIds = db
      .prepare("SELECT userId FROM chat_members WHERE chatId = ?")
      .all(chat.id)
      .map((r: any) => r.userId);
      
    chat.members = memberIds;
      
    // Map to full user objects
    chat.participants = memberIds.map(uid => {
      const user = allUsers.find(u => u.id === uid) || { id: uid, name: "Unknown User" };
      // Omit sensitive data if any
      delete user.securityAnswer;
      // Add online status based on connectedSockets
      return {
        ...user,
        online: Array.from(connectedSockets.values()).includes(uid)
      };
    });

    chat.deletedFor = db
      .prepare("SELECT userId FROM chat_deleted_for WHERE chatId = ?")
      .all(chat.id)
      .map((r: any) => r.userId);
  }
  return chats;
}

function loadUsers() {
  return db.prepare("SELECT * FROM users").all();
}

function loadMessages(chatId?: string) {
  let msgs;
  if (chatId) {
    msgs = db
      .prepare("SELECT * FROM messages WHERE chatId = ?")
      .all(chatId) as any[];
  } else {
    msgs = db.prepare("SELECT * FROM messages").all() as any[];
  }

  for (const msg of msgs) {
    msg.isDeleted = !!msg.isDeleted;
    msg.location = msg.location ? JSON.parse(msg.location) : undefined;
    msg.replyTo = msg.replyTo ? JSON.parse(msg.replyTo) : undefined;
    msg.reactions = db
      .prepare("SELECT emoji, userId FROM reactions WHERE messageId = ?")
      .all(msg.id);
    msg.starredBy = db
      .prepare("SELECT userId FROM message_starred_by WHERE messageId = ?")
      .all(msg.id)
      .map((r: any) => r.userId);
    msg.deletedFor = db
      .prepare("SELECT userId FROM message_deleted_for WHERE messageId = ?")
      .all(msg.id)
      .map((r: any) => r.userId);
  }
  return msgs;
}

async function startServer() {
  const app = express();

  if (process.env.CORS_ORIGIN) {
    app.use(cors({ origin: process.env.CORS_ORIGIN }));
  } else {
    app.use(cors());
  }

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use("/uploads", express.static(UPLOAD_DIR));

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    socket.on("identify", (userId: string) => {
      connectedSockets.set(socket.id, userId);
      const user = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(userId) as any;
      if (user) {
        db.prepare("UPDATE users SET lastActive = ? WHERE id = ?").run(
          Date.now(),
          userId,
        );
        io.emit("presence_updated", {
          userId,
          online: true,
          lastActive: Date.now(),
          privacy: user.lastActivePrivacy || "everyone",
        });

        const messages = loadMessages();
        const userChats = loadChats();
        messages.forEach((m: any) => {
          if (m.status === "sent" && m.senderId !== userId) {
            const chat = userChats.find((c) => c.id === m.chatId);
            if (
              chat &&
              (chat.members?.includes(userId) || chat.id === "global")
            ) {
              db.prepare(
                "UPDATE messages SET status = 'delivered' WHERE id = ?",
              ).run(m.id);
              m.status = "delivered";
              io.to(m.chatId).emit("message_updated", m);
            }
          }
        });
      }
    });

    socket.on("join_chat", (chatId: string) => socket.join(chatId));
    socket.on("leave_chat", (chatId: string) => socket.leave(chatId));

    socket.on("typing", (data) =>
      socket.to(data.chatId).emit("user_typing", data),
    );
    socket.on("call_user", (data) =>
      socket.to(data.chatId).emit("incoming_call", data),
    );
    socket.on("answer_call", (data) =>
      socket.to(data.chatId).emit("call_answered", data),
    );
    socket.on("ice_candidate", (data) =>
      socket.to(data.chatId).emit("ice_candidate", data),
    );
    socket.on("end_call", (data) =>
      socket.to(data.chatId).emit("call_ended", data),
    );

    // Modern WebRTC signaling
    socket.on("call:start", (data) => socket.to(data.chatId).emit("call:start", data));
    socket.on("call:offer", (data) => socket.to(data.chatId).emit("call:offer", data));
    socket.on("call:answer", (data) => socket.to(data.chatId).emit("call:answer", data));
    socket.on("call:ice-candidate", (data) => socket.to(data.chatId).emit("call:ice-candidate", data));
    socket.on("call:ringing", (data) => socket.to(data.chatId).emit("call:ringing", data));
    socket.on("call:reject", (data) => socket.to(data.chatId).emit("call:reject", data));
    socket.on("call:end", (data) => socket.to(data.chatId).emit("call:end", data));
    socket.on("call:failed", (data) => socket.to(data.chatId).emit("call:failed", data));

    socket.on(
      "mark_messages_read",
      (data: { chatId: string; readerId: string }) => {
        const msgs = db
          .prepare(
            "SELECT * FROM messages WHERE chatId = ? AND senderId != ? AND status != 'read'",
          )
          .all(data.chatId, data.readerId) as any[];
        const updateStmt = db.prepare(
          "UPDATE messages SET status = 'read' WHERE id = ?",
        );
        db.transaction(() => {
          msgs.forEach((m) => {
            updateStmt.run(m.id);
            m.status = "read";
            m.location = m.location ? JSON.parse(m.location) : undefined;
            m.replyTo = m.replyTo ? JSON.parse(m.replyTo) : undefined;
            m.reactions = db
              .prepare(
                "SELECT emoji, userId FROM reactions WHERE messageId = ?",
              )
              .all(m.id);
            m.starredBy = db
              .prepare(
                "SELECT userId FROM message_starred_by WHERE messageId = ?",
              )
              .all(m.id)
              .map((r: any) => r.userId);
            m.deletedFor = db
              .prepare(
                "SELECT userId FROM message_deleted_for WHERE messageId = ?",
              )
              .all(m.id)
              .map((r: any) => r.userId);
            io.to(data.chatId).emit("message_updated", m);
          });
        })();
      },
    );

    socket.on("disconnect", () => {
      const userId = connectedSockets.get(socket.id);
      if (userId) {
        connectedSockets.delete(socket.id);
        const isStillOnline = Array.from(connectedSockets.values()).includes(
          userId,
        );
        if (!isStillOnline) {
          const user = db
            .prepare("SELECT * FROM users WHERE id = ?")
            .get(userId) as any;
          if (user) {
            db.prepare("UPDATE users SET lastActive = ? WHERE id = ?").run(
              Date.now(),
              userId,
            );
            io.emit("presence_updated", {
              userId,
              online: false,
              lastActive: Date.now(),
              privacy: user.lastActivePrivacy || "everyone",
            });
          }
        }
      }
    });

    // Handle any message update emitted directly from clients using API or Socket context
    socket.on(
      "update_message_status",
      (data: { chatId: string; messageId: string; status: string }) => {
        // Some frontends might try to emit updates directly
      },
    );
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      host: HOST,
      port: PORT,
      database: "ok",
      uploadDir: "ok",
    });
  });

  // File Upload API
  app.post("/api/files/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const uploaderId = req.body.uploaderId || "unknown";
    const fileId = "file_" + Math.random().toString(36).substr(2, 9);

    db.prepare(
      `
      INSERT INTO file_attachments 
      (fileId, originalName, storedName, mimeType, size, path, uploaderId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      fileId,
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size,
      req.file.path,
      uploaderId,
      Date.now(),
    );

    // Always return relative path so frontend works seamlessly via relative endpoints
    res.json({
      fileId,
      url: `/api/files/${fileId}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });

  app.get("/api/files/:fileId", (req, res) => {
    const file = db
      .prepare("SELECT * FROM file_attachments WHERE fileId = ?")
      .get(req.params.fileId) as any;
    if (!file || !fs.existsSync(file.path)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    // Set proper header
    res.setHeader("Content-Type", file.mimeType);
    res.sendFile(path.resolve(file.path));
  });

  app.delete("/api/files/:fileId", (req, res) => {
    const file = db
      .prepare("SELECT * FROM file_attachments WHERE fileId = ?")
      .get(req.params.fileId) as any;
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    db.prepare("DELETE FROM file_attachments WHERE fileId = ?").run(
      file.fileId,
    );
    res.json({ success: true });
  });

  // General Routes
  app.get("/api/chats/messages/starred", (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: "userId query param is required" });
      return;
    }
    const msgs = loadMessages();
    const starredMessages = msgs.filter(
      (m: any) => m.starredBy && m.starredBy.includes(String(userId)),
    );
    res.json(starredMessages);
  });

  app.get("/api/users", (req, res) => {
    const q = req.query.q as string;
    let usersQuery =
      "SELECT id, name, avatar, phone, lastActive, lastActivePrivacy FROM users";
    let users;
    if (q) {
      users = db
        .prepare(
          `${usersQuery} WHERE LOWER(name) LIKE '%' || ? || '%' ORDER BY name ASC`,
        )
        .all(q.toLowerCase());
    } else {
      users = db.prepare(`${usersQuery} ORDER BY name ASC`).all();
    }

    // Add online status
    const result = users.map((u: any) => ({
      ...u,
      online: Array.from(connectedSockets.values()).includes(u.id),
      privacy: u.lastActivePrivacy || "everyone",
    }));

    res.json(result);
  });

  app.get("/api/users/:userId", (req, res) => {
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(req.params.userId) as any;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const isOnline = Array.from(connectedSockets.values()).includes(
      req.params.userId,
    );
    res.json({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      lastActive: user.lastActive,
      online: isOnline,
      privacy: user.lastActivePrivacy || "everyone",
    });
  });

  app.put("/api/users/:userId/profile", (req, res) => {
    const { name, avatar } = req.body;
    const userId = req.params.userId;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    
    if (name !== undefined) {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, userId);
      user.name = name;
    }
    if (avatar !== undefined) {
      db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, userId);
      user.avatar = avatar;
    }
    res.json(user);
  });

  app.post("/api/users/:userId/privacy", (req, res) => {
    const { lastActivePrivacy } = req.body;
    const userId = req.params.userId;
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as any;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (lastActivePrivacy) {
      db.prepare("UPDATE users SET lastActivePrivacy = ? WHERE id = ?").run(
        lastActivePrivacy,
        userId,
      );
      const isOnline = Array.from(connectedSockets.values()).includes(userId);
      user.lastActivePrivacy = lastActivePrivacy;
      io.emit("presence_updated", {
        userId,
        online: isOnline,
        lastActive: user.lastActive,
        privacy: user.lastActivePrivacy,
      });
      res.json(user);
    } else {
      res.status(400).json({ error: "Invalid payload" });
    }
  });

  app.post("/api/export", (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const chats = loadChats().filter(
      (c) => c.members?.includes(userId) || c.id === "global",
    );
    const chatIds = chats.map((c) => c.id);
    const messages = loadMessages().filter((m) => chatIds.includes(m.chatId));
    res.json({ user, chats, messages });
  });

  app.post("/api/import", (req, res) => {
    const { userId, data } = req.body;
    if (!userId || !data || !data.user)
      return res.status(400).json({ error: "Invalid format" });

    db.transaction(() => {
      const existingUser = db
        .prepare("SELECT id FROM users WHERE id = ?")
        .get(userId);
      if (existingUser) {
        db.prepare(
          "UPDATE users SET name = ?, securityQuestion = ?, securityAnswer = ?, avatar = ?, phone = ?, lastActivePrivacy = ? WHERE id = ?",
        ).run(
          data.user.name,
          data.user.securityQuestion,
          data.user.securityAnswer,
          data.user.avatar,
          data.user.phone,
          data.user.lastActivePrivacy,
          userId,
        );
      } else {
        // If importing completely new user? The flow typically replaces existing.
      }

      const insertChat = db.prepare(
        "INSERT OR REPLACE INTO chats (id, name, avatar, lastMessage, lastMessageTime, unreadCount, isGroup) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const insertMember = db.prepare(
        "INSERT OR IGNORE INTO chat_members (chatId, userId) VALUES (?, ?)",
      );
      if (data.chats) {
        data.chats.forEach((c: any) => {
          insertChat.run(
            c.id,
            c.name,
            c.avatar,
            c.lastMessage,
            c.lastMessageTime,
            c.unreadCount,
            c.isGroup ? 1 : 0,
          );
          if (c.members)
            c.members.forEach((uid: string) => insertMember.run(c.id, uid));
        });
      }

      const insertMsg = db.prepare(
        "INSERT OR REPLACE INTO messages (id, chatId, senderId, senderName, senderAvatar, text, timestamp, attachmentUrl, attachmentType, status, pinnedUntil, isDeleted, location, replyTo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      if (data.messages) {
        data.messages.forEach((m: any) => {
          insertMsg.run(
            m.id,
            m.chatId,
            m.senderId,
            m.senderName,
            m.senderAvatar,
            m.text,
            m.timestamp,
            m.attachmentUrl,
            m.attachmentType,
            m.status,
            m.pinnedUntil,
            m.isDeleted ? 1 : 0,
            m.location ? JSON.stringify(m.location) : null,
            m.replyTo ? JSON.stringify(m.replyTo) : null,
          );
        });
      }
    })();

    res.json({ success: true });
  });

  app.post("/api/register", (req, res) => {
    const { name, securityQuestion, securityAnswer } = req.body;
    if (!name || !securityQuestion || !securityAnswer)
      return res.status(400).json({ error: "Missing fields" });
    const existing = db
      .prepare("SELECT id FROM users WHERE LOWER(name) = LOWER(?)")
      .get(name);
    if (existing) return res.status(400).json({ error: "Username taken" });

    const id = "usr_" + Math.random().toString(36).substr(2, 9);
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    db.prepare(
      "INSERT INTO users (id, name, securityQuestion, securityAnswer, avatar) VALUES (?, ?, ?, ?, ?)",
    ).run(id, name, securityQuestion, securityAnswer, avatar);

    res.status(201).json({ id, name, securityQuestion, avatar });
  });

  app.get("/api/user-question", (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Username required" });
    const user = db
      .prepare(
        "SELECT securityQuestion FROM users WHERE LOWER(name) = LOWER(?)",
      )
      .get(name) as any;
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ securityQuestion: user.securityQuestion });
  });

  app.post("/api/login", (req, res) => {
    const { name, securityAnswer } = req.body;
    const user = db
      .prepare(
        "SELECT * FROM users WHERE LOWER(name) = LOWER(?) AND LOWER(securityAnswer) = LOWER(?)",
      )
      .get(name, securityAnswer) as any;
    if (!user) return res.status(401).json({ error: "Incorrect answer" });
    delete user.securityAnswer;
    res.json(user);
  });

  app.get("/api/chats", (req, res) => {
    res.json(loadChats());
  });

  app.get("/api/chats/:chatId/attachments", (req, res) => {
    const chatId = req.params.chatId;
    const msgs = db.prepare("SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp DESC").all(chatId) as any[];

    const media: any[] = [];
    const files: any[] = [];
    const links: any[] = [];

    const urlRegex = /(https?:\/\/[^\s]+)/g;

    for (const m of msgs) {
      if (m.isDeleted) continue;

      if (m.attachmentUrl && m.attachmentType) {
        const item = {
          id: m.id,
          messageId: m.id,
          fileName: m.attachmentName,
          mimeType: m.attachmentType,
          size: m.attachmentSize || 0,
          url: m.attachmentUrl,
          senderId: m.senderId,
          senderName: m.senderName,
          createdAt: m.timestamp
        };
        if (m.attachmentType.startsWith('image/') || m.attachmentType.startsWith('video/')) {
          media.push(item);
        } else {
          files.push(item);
        }
      }

      if (m.text) {
        const urls = m.text.match(urlRegex);
        if (urls) {
          for (const url of urls) {
            links.push({
              messageId: m.id,
              url,
              text: m.text,
              senderId: m.senderId,
              senderName: m.senderName,
              createdAt: m.timestamp
            });
          }
        }
      }
    }

    res.json({ media, files, links });
  });

  app.get("/api/chats/:chatId/messages", (req, res) => {
    res.json(loadMessages(req.params.chatId));
  });

  app.post("/api/chats/:chatId/messages", (req, res) => {
    const chatId = req.params.chatId;
    let {
      senderId,
      senderName,
      senderAvatar,
      text,
      attachmentUrl,
      attachmentType,
      attachmentName,
      attachmentSize,
      location,
      replyTo,
    } = req.body;

    if ((!text || text.trim() === "") && !attachmentUrl && !location) {
      return res.status(400).json({ error: "Content required" });
    }

    const chat = db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .get(chatId) as any;
    if (!chat) return res.status(404).json({ error: "Chat not found" });

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
          const filepath = path.join(UPLOAD_DIR, filename);
          fs.writeFileSync(filepath, base64Data, "base64");
          // Store it as a proper file attachment entry to keep it consistent
          const fileId = "file_" + Math.random().toString(36).substr(2, 9);
          attachmentUrl = `/api/files/${fileId}`;
          attachmentName = filename;
          attachmentSize = Buffer.byteLength(base64Data, 'base64');
          db.prepare(
            `
            INSERT INTO file_attachments 
            (fileId, originalName, storedName, mimeType, size, path, uploaderId, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            fileId,
            filename,
            filename,
            mimeType,
            0,
            filepath,
            senderId || "system",
            Date.now(),
          );
        }
      } catch (e) {
        console.error("Failed to save base64 attachment", e);
      }
    }

    const id = "msg_" + Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    const finalLocation = location ? JSON.stringify(location) : null;
    const finalReplyTo = replyTo ? JSON.stringify(replyTo) : null;

    db.prepare(
      "INSERT INTO messages (id, chatId, senderId, senderName, senderAvatar, text, timestamp, attachmentUrl, attachmentType, attachmentName, attachmentSize, status, location, replyTo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      chatId,
      senderId || "api-user",
      senderName || "API User",
      senderAvatar,
      text || (location ? "📍 Location shared" : ""),
      timestamp,
      attachmentUrl,
      attachmentType,
      attachmentName || null,
      attachmentSize || null,
      "sent",
      finalLocation,
      finalReplyTo,
    );

    db.prepare(
      "UPDATE chats SET lastMessage = ?, lastMessageTime = ? WHERE id = ?",
    ).run(text || (location ? "📍 Location" : ""), timestamp, chatId);

    const fullMsg = loadMessages(chatId).find((m: any) => m.id === id);
    const updatedChat = loadChats().find((c) => c.id === chatId);

    io.to(chatId).emit("receive_message", fullMsg);
    io.emit("chat_updated", updatedChat);

    const members = updatedChat?.members || [];
    const onlineOthers = members.filter(
      (m: string) =>
        m !== senderId && Array.from(connectedSockets.values()).includes(m),
    );
    if (
      onlineOthers.length > 0 ||
      (chatId === "global" && connectedSockets.size > 1)
    ) {
      db.prepare("UPDATE messages SET status = 'delivered' WHERE id = ?").run(
        id,
      );
      fullMsg.status = "delivered";
      io.to(chatId).emit("message_updated", fullMsg);
    }

    res.status(201).json(fullMsg);
  });

  app.put("/api/chats/:chatId/messages/:messageId/location", (req, res) => {
    const { chatId, messageId } = req.params;
    const { lat, lng } = req.body;

    const message = loadMessages(chatId).find((m: any) => m.id === messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.location && message.location.isLive) {
      if (
        message.location.expiresAt &&
        message.location.expiresAt < Date.now()
      ) {
        return res.status(400).json({ error: "Expired" });
      }
      message.location.lat = lat;
      message.location.lng = lng;
      db.prepare("UPDATE messages SET location = ? WHERE id = ?").run(
        JSON.stringify(message.location),
        messageId,
      );
      io.to(chatId).emit("message_updated", message);
      res.json(message);
    } else {
      res.status(400).json({ error: "Not a live location" });
    }
  });

  app.post("/api/chats/direct", (req, res) => {
    const { currentUserId, targetUserId } = req.body;
    if (!currentUserId || !targetUserId)
      return res
        .status(400)
        .json({ error: "currentUserId and targetUserId required" });

    // Find existing direct chat between these two users
    const allChats = loadChats();
    const existingChat = allChats.find(
      (c) =>
        !c.isGroup &&
        c.members?.length === 2 &&
        c.members.includes(currentUserId) &&
        c.members.includes(targetUserId),
    );

    if (existingChat) {
      return res.json(existingChat);
    }

    // Get target user to name the chat (chats table has name)
    const targetUser = db
      .prepare("SELECT name, avatar FROM users WHERE id = ?")
      .get(targetUserId) as any;
    const currentUserInfo = db
      .prepare("SELECT name, avatar FROM users WHERE id = ?")
      .get(currentUserId) as any;
    if (!targetUser || !currentUserInfo)
      return res.status(404).json({ error: "User not found" });

    const id = "chat_" + Math.random().toString(36).substr(2, 9);
    db.prepare(
      "INSERT INTO chats (id, name, lastMessage, lastMessageTime, unreadCount, isGroup) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, "Direct Chat", "", Date.now(), 0, 0);

    const insertMember = db.prepare(
      "INSERT INTO chat_members (chatId, userId) VALUES (?, ?)",
    );
    insertMember.run(id, currentUserId);
    insertMember.run(id, targetUserId);

    const newChat = loadChats().find((c) => c.id === id);
    io.emit("new_chat", newChat);
    res.status(201).json(newChat);
  });

  app.post("/api/chats", (req, res) => {
    const { name, isGroup, members } = req.body;
    if (!name) return res.status(400).json({ error: "Chat name required" });

    const id = "chat_" + Math.random().toString(36).substr(2, 9);
    db.prepare(
      "INSERT INTO chats (id, name, lastMessage, lastMessageTime, unreadCount, isGroup) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, name, "", Date.now(), 0, isGroup ? 1 : 0);

    const insertMember = db.prepare(
      "INSERT INTO chat_members (chatId, userId) VALUES (?, ?)",
    );
    if (members) members.forEach((uid: string) => insertMember.run(id, uid));

    const newChat = loadChats().find((c) => c.id === id);
    io.emit("new_chat", newChat);
    res.status(201).json(newChat);
  });

  app.post("/api/chats/:chatId/messages/:messageId/react", (req, res) => {
    const { chatId, messageId } = req.params;
    const { emoji, userId } = req.body;

    const existing = db
      .prepare(
        "SELECT * FROM reactions WHERE messageId = ? AND emoji = ? AND userId = ?",
      )
      .get(messageId, emoji, userId);
    if (existing) {
      db.prepare(
        "DELETE FROM reactions WHERE messageId = ? AND emoji = ? AND userId = ?",
      ).run(messageId, emoji, userId);
    } else {
      db.prepare(
        "INSERT INTO reactions (messageId, emoji, userId) VALUES (?, ?, ?)",
      ).run(messageId, emoji, userId);
    }

    const message = loadMessages(chatId).find((m: any) => m.id === messageId);
    io.to(chatId).emit("message_updated", message);
    res.json(message);
  });

  app.post("/api/chats/:chatId/messages/:messageId/star", (req, res) => {
    const { chatId, messageId } = req.params;
    const { userId } = req.body;

    const existing = db
      .prepare(
        "SELECT * FROM message_starred_by WHERE messageId = ? AND userId = ?",
      )
      .get(messageId, userId);
    if (existing) {
      db.prepare(
        "DELETE FROM message_starred_by WHERE messageId = ? AND userId = ?",
      ).run(messageId, userId);
    } else {
      db.prepare(
        "INSERT INTO message_starred_by (messageId, userId) VALUES (?, ?)",
      ).run(messageId, userId);
    }

    const message = loadMessages(chatId).find((m: any) => m.id === messageId);
    io.to(chatId).emit("message_updated", message);
    res.json(message);
  });

  app.post("/api/chats/:chatId/messages/:messageId/pin", (req, res) => {
    const { chatId, messageId } = req.params;
    const { durationDays } = req.body;

    const pinnedUntil =
      durationDays === 0
        ? null
        : Date.now() + durationDays * 24 * 60 * 60 * 1000;
    db.prepare("UPDATE messages SET pinnedUntil = ? WHERE id = ?").run(
      pinnedUntil,
      messageId,
    );

    const message = loadMessages(chatId).find((m: any) => m.id === messageId);
    io.to(chatId).emit("message_updated", message);
    res.json(message);
  });

  app.delete("/api/chats/:chatId/messages/:messageId", (req, res) => {
    const { chatId, messageId } = req.params;
    const { userId, type } = req.body;

    const message = loadMessages(chatId).find((m: any) => m.id === messageId);
    if (!message) return res.status(404).json({ error: "Not found" });

    if (type === "for_everyone") {
      if (message.senderId !== userId)
        return res.status(403).json({ error: "Forbidden" });
      db.prepare(
        "UPDATE messages SET isDeleted = 1, text = 'This message was deleted', attachmentUrl = NULL, attachmentType = NULL WHERE id = ?",
      ).run(messageId);
      const updated = loadMessages(chatId).find((m: any) => m.id === messageId);
      io.to(chatId).emit("message_updated", updated);
      res.json(updated);
    } else {
      db.prepare(
        "INSERT INTO message_deleted_for (messageId, userId) VALUES (?, ?) ON CONFLICT DO NOTHING",
      ).run(messageId, userId);
      message.deletedFor.push(userId);
      res.json(message);
    }
  });

  app.delete("/api/chats/:chatId/clear", (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.body;
    
    // Find all messages in this chat, and add them to message_deleted_for for this user
    const msgs = db.prepare("SELECT id FROM messages WHERE chatId = ?").all(chatId) as any[];
    
    const insertStmt = db.prepare("INSERT INTO message_deleted_for (messageId, userId) VALUES (?, ?) ON CONFLICT DO NOTHING");
    db.transaction(() => {
      for (const m of msgs) {
        insertStmt.run(m.id, userId);
      }
    })();
    
    res.json({ success: true, chatId });
  });

  app.delete("/api/chats/:chatId", (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.body;
    db.prepare(
      "INSERT INTO chat_deleted_for (chatId, userId) VALUES (?, ?) ON CONFLICT DO NOTHING",
    ).run(chatId, userId);
    res.json({ success: true, chatId });
  });

  app.get("/api/calls", (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const calls = db
      .prepare("SELECT * FROM call_logs WHERE callerId = ? OR calleeId = ? ORDER BY startedAt DESC LIMIT 50")
      .all(userId, userId);
    res.json(calls);
  });

  app.post("/api/calls", (req, res) => {
    const { callerId, calleeId, chatId, type, status, startedAt } = req.body;
    const id = "call_" + Math.random().toString(36).substr(2, 9);
    db.prepare(
      "INSERT INTO call_logs (id, callerId, calleeId, chatId, type, status, startedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, callerId, calleeId, chatId, type, status, startedAt || Date.now());
    res.status(201).json({ id });
  });

  app.patch("/api/calls/:id", (req, res) => {
    const { id } = req.params;
    const { status, answeredAt, endedAt, durationSeconds } = req.body;
    let updateFields: string[] = [];
    let params: any[] = [];

    if (status) { updateFields.push("status = ?"); params.push(status); }
    if (answeredAt) { updateFields.push("answeredAt = ?"); params.push(answeredAt); }
    if (endedAt) { updateFields.push("endedAt = ?"); params.push(endedAt); }
    if (durationSeconds !== undefined) { updateFields.push("durationSeconds = ?"); params.push(durationSeconds); }

    if (updateFields.length > 0) {
      params.push(id);
      db.prepare(`UPDATE call_logs SET ${updateFields.join(", ")} WHERE id = ?`).run(...params);
    }
    res.json({ success: true });
  });

  // Global socket error handler
  io.engine.on("connection_error", (err) => {
    console.log("Socket connection error:", err);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`\n=================================`);
    console.log(`  GlassChat Local Server     `);
    console.log(`=================================`);
    console.log(`Local Access:      http://localhost:${PORT}`);
    console.log(`Network/Tailscale: http://${HOST}:${PORT}`);
    console.log(`Database Path:     ${DB_PATH}`);
    console.log(`Uploads Directory: ${UPLOAD_DIR}`);
    console.log(`=================================\n`);
  });
}

startServer();
