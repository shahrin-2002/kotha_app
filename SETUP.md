# কোথা (Kotha) — Setup Guide

This guide walks you through running the Kotha app from scratch on a Windows machine.

---

## 1. Prerequisites

### Node.js

Download and install Node.js (version 18 or newer) from https://nodejs.org. Pick the **LTS** version. During installation, accept all defaults.

To verify it installed correctly, open a terminal (PowerShell or Command Prompt) and run:

```
node --version
npm --version
```

Both commands should print a version number.

### Google Chrome

Use Chrome (or Edge) as your browser. Kotha uses the Web Audio API and WebAuthn, which work best in Chromium-based browsers.

---

## 2. Project Structure

```
kotha/
├── server/          ← Backend (Node.js + Express)
│   ├── src/
│   ├── plans/       ← Conversation flow definitions
│   ├── prompts/     ← Bangla prompt text
│   ├── data/        ← SQLite database (auto-created)
│   └── .env         ← You create this (see below)
└── client/          ← Frontend (React + Vite)
    └── src/
```

---

## 3. Set Up Environment Variables

The server needs one API key to work. Create a file called `.env` inside the `server/` folder:

```
server/.env
```

Put this inside:

```
OPENAI_API_KEY=your-key-here
```

Replace `your-key-here` with the API key provided by the researcher.

This key is used for:

- **Voice recognition** — OpenAI Whisper transcribes Bangla speech to text
- **Intent classification** — GPT-4o-mini classifies what the user said when rule-based matching fails

No other environment variables are required.

---

## 4. Install Dependencies

Open a terminal and navigate to the project folder. Then install dependencies for both server and client:

```
cd kotha/server
npm install

cd ../client
npm install
```

---

## 5. Fresh Database (Optional)

The server creates a SQLite database automatically on first run. If you want a clean start (e.g., re-seed test accounts), delete the old database:

```
del server\data\kotha.db
```

On next startup, the server will recreate it with three test accounts:

| Name    | PIN  | Balance |
|---------|------|---------|
| আয়েশা  | 1234 | ৳৫০০০   |
| ফাতেমা  | 2345 | ৳৫০০০   |
| রুমানা  | 3456 | ৳৫০০০   |

---

## 6. Run the Server

```
cd kotha/server
npx tsx src/index.ts
```

You should see output like:

```
Database initialized at .../kotha.db
Loaded 7 plans: add_contact, cash_out, check_balance, ...
Loaded 86 Bangla prompts
OpenAI Whisper STT enabled
Kotha server running on http://localhost:3001
```

Keep this terminal open.

---

## 7. Run the Client

Open a **second terminal**:

```
cd kotha/client
npm run dev
```

You should see:

```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

Keep this terminal open too.

---

## 8. Open the App

Open Chrome and go to:

```
http://localhost:5173
```

---

## 9. First-Time Fingerprint Setup

Kotha uses real fingerprint authentication via Windows Hello. Your laptop **must have a fingerprint sensor** (most modern laptops do — it's usually on the power button or below the keyboard).

### Step A: Set up a Windows PIN (required first)

Windows requires a PIN before you can use fingerprint. If you already have a PIN, skip to Step B.

1. Press **Win + I** to open Settings
2. Go to **Accounts** → **Sign-in options**
3. Click **PIN (Windows Hello)** → **Set up**
4. Create any PIN (e.g., `1234`) — you won't need to remember this for Kotha, it's just a Windows requirement

### Step B: Register your fingerprint in Windows

1. In the same **Settings** → **Accounts** → **Sign-in options** page
2. Find **Fingerprint recognition (Windows Hello)**
3. Click **Set up** → **Get started**
4. It will ask for your Windows PIN (the one from Step A)
5. Touch your finger on the sensor repeatedly until it says "All set!"
6. You can add more fingers by clicking **Add another finger**

### Step C: Register your fingerprint in Kotha (first time only)

1. Open the app in Chrome (`http://localhost:5173`)
2. Since this is your first time, the app will show three test accounts: **আয়েশা**, **ফাতেমা**, **রুমানা**
3. Tap any account name — pick one to be "your" account
4. A Windows Hello popup will appear — touch the fingerprint sensor
5. This links your fingerprint to that account
6. The app will then automatically log you in

### Step D: Subsequent logins (automatic)

After registration, every time you open the app:
1. The app will say "আঙুল দিন" (give your finger)
2. A Windows Hello popup appears automatically
3. Touch the fingerprint sensor — you're logged in
4. No account selection needed — it remembers which account your finger belongs to

> **Important:** Each person should register with a **different test account**. If আয়েশা is taken, use ফাতেমা or রুমানা. To start fresh (clear all fingerprint registrations), delete the database file: `del server\data\kotha.db` and restart the server.

---

## 10. Using the App

Once logged in, you can:

- **Send money** — Say "টাকা পাঠাবো" or tap the send money icon
- **Cash out** — Say "ক্যাশ আউট" or tap the icon
- **Recharge** — Say "রিচার্জ" or tap the icon
- **Check balance** — Say "ব্যালেন্স" or tap the icon

The app will guide you through each step with voice prompts in Bangla.

If voice recognition isn't working (e.g., no microphone), you can use the quick-phrase buttons or the text input box at the bottom of the screen.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "সার্ভারে সংযোগ করা যাচ্ছে না" (can't connect to server) | Make sure the server is running in the other terminal |
| Fingerprint prompt shows PIN instead of fingerprint | Go to Settings → Accounts → Sign-in options → Fingerprint recognition and add your finger |
| Microphone not working | Allow microphone access when Chrome asks. Check that your mic is not muted in Windows sound settings |
| Server shows "OPENAI_API_KEY not set" | Make sure `server/.env` exists and has the correct key |
| Voice says "বুঝতে পারিনি" (didn't understand) repeatedly | Speak clearly and close to the microphone. You can also use the text input or quick buttons |

---

## Stopping the App

Press `Ctrl+C` in both terminal windows to stop the server and client.
