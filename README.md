# GlassChat

GlassChat is a **local-first, Windows-ready private chat application** built for personal use, trusted-device communication, and private networks.

It runs from your own machine, stores chats in a local SQLite database, saves uploaded media/files locally, and can be accessed securely from your phone or other devices through [Tailscale](https://tailscale.com/).

GlassChat is designed for a private “own server” workflow, not a public cloud chat platform.

---

## Features

- Local-first chat server
- SQLite-based persistent message storage
- Local file and media storage
- One-to-one direct chats
- User discovery inside the local server
- Image, PDF, document, audio, and file sending
- Profile image support
- Online / last-active presence
- Socket.IO real-time messaging
- Windows-friendly setup
- Tailscale remote access support
- Optional HTTPS access through Tailscale Serve
- No Firebase, Supabase, or external cloud database by default

---

## Architecture

```txt
GlassChat
├── Frontend: React + Vite
├── Backend: Node.js + Express
├── Realtime: Socket.IO
├── Database: SQLite
├── File Storage: Local uploads folder
└── Private Remote Access: Tailscale
```

Default local storage:

```txt
data/app.db      → SQLite database
uploads/         → images, PDFs, documents, audio, and files
```

---

## Requirements

- Node.js 18 or newer
- npm
- Windows, macOS, or Linux
- Tailscale, optional but recommended for phone/remote access

---

## Installation

Clone the repository:

```bash
git clone https://github.com/gilbertjackob-tech/GlassChat.git
cd GlassChat
```

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

---

## Environment Configuration

Default `.env`:

```env
HOST=0.0.0.0
PORT=3000
DATABASE_PATH=./data/app.db
UPLOAD_DIR=./uploads
CORS_ORIGIN=
```

Recommended local/private setup:

```env
HOST=0.0.0.0
PORT=3000
DATABASE_PATH=./data/app.db
UPLOAD_DIR=./uploads
CORS_ORIGIN=
```

Explanation:

```txt
HOST=0.0.0.0        Allows access from LAN/Tailscale devices
PORT=3000           App runs on port 3000
DATABASE_PATH       SQLite database location
UPLOAD_DIR          Local media/file storage folder
CORS_ORIGIN         Leave empty for same-origin/private use
```

---

## Running the App

Development mode:

```bash
npm run dev
```

Production/local start:

```bash
npm start
```

After starting, you should see something like:

```txt
=================================
  GlassChat Local Server
=================================
Local Access:      http://localhost:3000
Network/Tailscale: http://0.0.0.0:3000
Database Path:     ./data/app.db
Uploads Directory: ./uploads
=================================
```

Open on the host PC:

```txt
http://localhost:3000
```

---

## Windows Quick Start

From PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Or use the helper scripts if available:

```txt
start-windows.bat
start-windows.ps1
```

If Windows Firewall asks for permission, allow **Node.js** on **Private networks**.

---

## Access from Phone Using Tailscale

GlassChat works well as a private phone-accessible chat server using Tailscale.

### Step 1: Install Tailscale

Install Tailscale on:

```txt
Host PC
Phone
Other trusted devices
```

Log in using the same Tailscale account or share the device through Tailscale.

### Step 2: Find PC Tailscale IP

On Windows PowerShell:

```powershell
tailscale ip -4
```

Example:

```txt
100.122.210.20
```

### Step 3: Open from Phone

On your phone browser:

```txt
http://YOUR_PC_TAILSCALE_IP:3000
```

Example:

```txt
http://100.122.210.20:3000
```

---

## Optional HTTPS with Tailscale Serve

If MagicDNS and HTTPS certificates are enabled in Tailscale, you can expose GlassChat over HTTPS inside your tailnet.

Start GlassChat:

```bash
npm run dev
```

In another terminal:

```bash
tailscale serve localhost:3000
```

Tailscale will show a URL like:

```txt
https://desktop-name.tailxxxx.ts.net/
|-- proxy http://localhost:3000
```

Open that HTTPS URL from your phone or other tailnet devices.

---

## iPhone / Mobile Usage

On iPhone or Android:

```txt
Open browser
Go to your Tailscale IP or MagicDNS HTTPS URL
Create a GlassChat user
Start chatting
```

For app-like usage on iPhone:

```txt
Safari → Share → Add to Home Screen
```

---

## Storage Model

GlassChat does not use cloud storage by default.

```txt
Messages      → SQLite database
Users         → SQLite database
Chats         → SQLite database
File metadata → SQLite database
Actual files  → uploads/ folder
```

Important folders:

```txt
data/
uploads/
```

To back up GlassChat, back up both:

```txt
data/app.db
uploads/
```

---

## Reset Local Data

To reset the app completely:

```powershell
Stop the server
Remove-Item .\data\app.db
```

Then restart:

```powershell
npm run dev
```

A fresh database will be created automatically.

To preserve a backup before reset:

```powershell
Copy-Item .\data\app.db .\data\app_backup.db
Remove-Item .\data\app.db
npm run dev
```

---

## Troubleshooting

### Port Already in Use

Check which process is using port 3000:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000 | Select-Object LocalPort,OwningProcess,State
```

Kill the process:

```powershell
Stop-Process -Id PROCESS_ID -Force
```

Or kill all Node processes:

```powershell
Stop-Process -Name node -Force
```

---

### SQLite Error: Database Disk Image Is Malformed

This means the SQLite database file is corrupted.

Fix:

```powershell
Copy-Item .\data\app.db .\data\app_corrupt_backup.db
Remove-Item .\data\app.db
npm run dev
```

You will need to register users again.

---

### Phone Cannot Open the App

Check:

```txt
1. PC server is running
2. Tailscale is connected on both devices
3. You are using the PC's Tailscale IP, not the phone's IP
4. Windows Firewall allows Node.js on Private networks
5. HOST=0.0.0.0 in .env
```

Test health endpoint:

```txt
http://YOUR_PC_TAILSCALE_IP:3000/api/health
```

---

### Vite Host Blocked

If you see:

```txt
Blocked request. This host is not allowed.
```

Set this in `vite.config.ts`:

```ts
server: {
  host: "0.0.0.0",
  port: 3000,
  allowedHosts: true,
}
```

---

### Vite WebSocket / HMR Error on Mobile

If mobile console shows:

```txt
WebSocket connection to ws://localhost:24678 failed
```

Disable Vite HMR for stable Tailscale testing:

```ts
server: {
  host: "0.0.0.0",
  port: 3000,
  allowedHosts: true,
  hmr: false,
}
```

Then restart:

```bash
npm run dev
```

---

## Privacy and Security

GlassChat is designed for trusted private use.

- No Firebase
- No Supabase
- No external cloud database
- Chats are stored locally
- Files are stored locally
- Tailscale can be used for private remote access
- Filename sanitization and path traversal protection should be enforced

Current security model:

```txt
Trusted local/private network
No strict password/JWT authentication by default
```

Do not expose GlassChat publicly to the internet without adding proper authentication, authorization, rate limiting, and upload restrictions.

---

## Recommended Use Cases

GlassChat is suitable for:

```txt
Personal PC ↔ phone chat
Trusted family/private chat
Local-first file transfer
Private Tailscale-based messaging
GlassBox/agent communication layer
Local automation dashboard messaging
```

It is not intended as-is for:

```txt
Public WhatsApp replacement
Untrusted users
Large-scale public deployment
Internet-exposed file hosting
```

---

## Direct Chat Integrity

Each one-to-one direct chat must be a unique pair relationship.

Example:

```txt
Hasnat PC + Hasnat IOS = one direct chat
Hasnat PC + Bihi       = different direct chat
Hasnat IOS + Bihi      = different direct chat
```

A message, file, call, reaction, pin, delete, or media item must always belong to the exact `chatId` it was created for.

Direct chats should never be reused only because they are named `Direct Chat`.

---

## Development Notes

Recommended checks before pushing changes:

```bash
npm install
npm run dev
```

Recommended manual tests:

```txt
1. Create two users
2. Start a direct chat
3. Send text both ways
4. Send image/file both ways
5. Refresh PC while inside chat
6. Refresh phone while inside chat
7. Restart server and verify history remains
8. Confirm files still open/download
```

For multi-user testing:

```txt
Hasnat PC + Hasnat IOS = one direct chat
Hasnat PC + Bihi       = different direct chat
Hasnat IOS + Bihi      = different direct chat
```

Each direct pair must have its own unique chat.

---

## Suggested Debug Checklist

Use this when testing chat-routing stability:

```txt
1. Create three users:
   - Hasnat PC
   - Hasnat IOS
   - Bihi

2. Send "ios only" to Hasnat IOS.
   It must appear only in the Hasnat IOS chat.

3. Send "bihi only" to Bihi.
   It must appear only in the Bihi chat.

4. Reply from Bihi.
   It must appear only in the Bihi chat.

5. Reply from Hasnat IOS.
   It must appear only in the Hasnat IOS chat.

6. Send an image to Hasnat IOS.
   It must appear only in Hasnat IOS chat/media.

7. Send a PDF to Bihi.
   It must appear only in Bihi chat/docs.

8. Start a call from Hasnat IOS chat.
   Only Hasnat IOS should ring.

9. Start a call from Bihi chat.
   Only Bihi should ring.

10. Refresh both PC and phone inside chats.
    No blank screen should appear.
```

---

## License

Private/personal project unless a license is added.
