# GlassChat

GlassChat is designed to be a local-first, Windows-local-ready chat application. It stores everything locally using SQLite and is easy to set up for personal or private use, especially over [Tailscale](https://tailscale.com/).

## Requirements

- Node.js (v18+ recommended)
- Tailscale (optional, for remote access)

## Setup Instructions

1. **Install Dependencies**
   Run the following to install all dependencies:
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   (On Windows, you can just manually duplicate the file or use `copy .env.example .env`).

   The defaults in `.env` are:
   ```env
   HOST=0.0.0.0
   PORT=3000
   DATABASE_PATH=./data/app.db
   UPLOAD_DIR=./uploads
   CORS_ORIGIN=
   ```

3. **Start the Server**
   To run in development mode:
   ```bash
   npm run dev
   ```

   To start the production server:
   ```bash
   npm start
   ```

   **Windows Helpers:**
   You can simply double-click `start-windows.bat` or run `start-windows.ps1` to start the app.

## Network Access via Tailscale

If you want to access GlassChat from your phone or another computer:

1. Install Tailscale on your host PC and your phone.
2. Log in to both devices with the same Tailscale account.
3. Get your PC's Tailscale IP (e.g., `100.x.x.x`).
4. Make sure your Windows Firewall allows Node.js through the private network.
5. On your phone, open your browser and navigate to:
   ```
   http://YOUR_PC_TAILSCALE_IP:3000
   ```

## Privacy & Security

- There is strictly **no cloud database** (no Firebase, Supabase, etc).
- Data and media are stored locally in the `./data` and `./uploads` directories on your machine.
- Path traversal block and base filename sanitization is enforced.
- **No strict user authentication** (it's built for trusted private networks).
