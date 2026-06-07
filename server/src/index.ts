import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import OpenAI from "openai";
import { loadPlans, resolvePrompt, getPrompts } from "./core/planRegistry.js";
import { createSession, logEvent } from "./core/sessionContext.js";
import { startTask, handleVoiceTurn, handleTapSelection } from "./core/orchestrator.js";
import {
  initDatabase,
  getRecipients,
  getAgents,
  getFirstParticipant,
  getParticipant,
  updateBalance,
  addLedgerEntry,
  saveVoiceEvent,
  createParticipant,
  getAllParticipants,
  getMetricsForSession,
  getVoiceEventsForSession,
  insertSession,
  addRecipient,
  storeCredential,
  getParticipantIdByCredential,
  hasAnyCredentials,
  getAllCredentialIds,
} from "./data/database.js";
import {
  startTaskMetric,
  endTaskMetric,
  incrementRetry,
  incrementHelp,
  incrementModalitySwitch,
} from "./instrumentation/metricTracker.js";
import { exportSession } from "./instrumentation/sessionExporter.js";
import type { SessionContext } from "./core/types.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = express();
app.use(cors());
app.use(express.json());

await initDatabase();
loadPlans();

const sessions = new Map<string, SessionContext>();

// ── REST API ──────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", bangla_test: "কোথা চালু আছে" });
});

app.get("/api/tts", async (req, res) => {
  const text = req.query.text as string;
  if (!text) {
    res.status(400).json({ error: "text required" });
    return;
  }
  try {
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=bn&client=gtx&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      res.status(502).json({ error: "TTS fetch failed" });
      return;
    }
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=86400");
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).json({ error: "TTS error" });
  }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
let openaiClient: OpenAI | null = null;
if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log("OpenAI Whisper STT enabled");
} else {
  console.log("⚠️ No OPENAI_API_KEY — server STT disabled");
}

app.post("/api/stt", async (req, res) => {
  if (!openaiClient) {
    res.status(503).json({ error: "STT not configured. Set OPENAI_API_KEY in .env" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length < 1000) {
      res.json({ transcript: "" });
      return;
    }

    const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
    const transcription = await openaiClient.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "bn",
      prompt: "বাংলাদেশি বাংলা। বিকাশ মোবাইল ব্যাংকিং। টাকা পাঠান, ক্যাশ আউট, রিচার্জ, ব্যালেন্স। হ্যাঁ, না, বাতিল। করিম, রহিমা, জামাল। একশো, দুইশো, পাঁচশো, এক হাজার, দুই হাজার। পাঁচশ টাকা, হাজার টাকা।",
    });

    // Filter Whisper hallucinations — when given silence, it repeats junk
    const t = (transcription.text ?? "").trim();
    const isHallucination = t.length > 60 || t.includes("কথোপকথন") || t.includes("সাবটাইটেল") || t.includes("subscribe");
    if (isHallucination) {
      console.log(`[STT] hallucination filtered: "${t.substring(0, 50)}..."`);
      res.json({ transcript: "" });
      return;
    }

    console.log(`[STT] "${transcription.text}"`);
    res.json({ transcript: transcription.text ?? "" });
  } catch (err: any) {
    console.error("[STT error]", err.message);
    res.status(500).json({ error: "STT failed", detail: err.message });
  }
});

app.get("/api/prompts", (_req, res) => {
  res.json(getPrompts());
});

app.get("/api/recipients", (req, res) => {
  const participantId = req.query.participant_id as string | undefined;
  res.json(getRecipients(participantId));
});

app.post("/api/recipients", (req, res) => {
  const { name, phone, participant_id } = req.body;
  if (!name || !phone) {
    res.status(400).json({ error: "name and phone required" });
    return;
  }
  const recipient = addRecipient(name, phone, participant_id);
  res.json(recipient);
});

app.get("/api/participants", (_req, res) => {
  res.json(getAllParticipants());
});

app.post("/api/participants", (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin || pin.length !== 4) {
    res.status(400).json({ error: "name and 4-digit pin required" });
    return;
  }
  const participant = createParticipant(name, pin);
  res.json(participant);
});

// ── WebAuthn Fingerprint Auth ────────────────────────────

const RP_NAME = "Kotha";
const RP_ID = "localhost";

app.get("/api/auth/status", (_req, res) => {
  res.json({ has_credentials: hasAnyCredentials() });
});

app.post("/api/auth/register-options", (req, res) => {
  const { participant_id } = req.body;
  const participant = getParticipant(participant_id);
  if (!participant) {
    res.status(404).json({ error: "participant not found" });
    return;
  }

  const challenge = crypto.randomBytes(32).toString("base64url");

  res.json({
    challenge,
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: Buffer.from(participant_id).toString("base64url"),
      name: participant.name,
      displayName: participant.name,
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },
      { alg: -257, type: "public-key" },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      requireResidentKey: true,
      residentKey: "required",
      userVerification: "required",
    },
    timeout: 60000,
  });
});

app.post("/api/auth/register-verify", (req, res) => {
  const { participant_id, credential_id } = req.body;
  if (!participant_id || !credential_id) {
    res.status(400).json({ error: "participant_id and credential_id required" });
    return;
  }
  const participant = getParticipant(participant_id);
  if (!participant) {
    res.status(404).json({ error: "participant not found" });
    return;
  }
  storeCredential(participant_id, credential_id, "");
  res.json({ success: true, participant_name: participant.name });
});

app.post("/api/auth/login-options", (_req, res) => {
  const challenge = crypto.randomBytes(32).toString("base64url");
  res.json({
    challenge,
    rpId: RP_ID,
    userVerification: "required",
    timeout: 60000,
  });
});

app.post("/api/auth/login-verify", (req, res) => {
  const { credential_id } = req.body;
  if (!credential_id) {
    res.status(400).json({ error: "credential_id required" });
    return;
  }
  const participantId = getParticipantIdByCredential(credential_id);
  if (!participantId) {
    res.status(401).json({ error: "unknown credential" });
    return;
  }
  const participant = getParticipant(participantId);
  if (!participant) {
    res.status(404).json({ error: "participant not found" });
    return;
  }

  const session = createSession(participant.id);
  sessions.set(session.session_id, session);
  insertSession(session.session_id, participant.id);
  logEvent(session, "session_start", { participant_name: participant.name, auth: "fingerprint" });

  const welcomeText = resolvePrompt("login.welcome", { name: participant.name });
  res.json({
    session_id: session.session_id,
    participant,
    recipients: getRecipients(participant.id),
    agents: getAgents(),
    prompt_text: welcomeText,
    prompt_id: "login.welcome",
    ui_update: {
      screen: "home",
      filled_slots: {},
      show_mic: true,
      is_modality_switched: false,
      task_complete: false,
      return_home: false,
    },
  });
});

// ── Sessions ────────────────────────────────────────────

app.post("/api/sessions", (req, res) => {
  const { participant_id } = req.body;
  const participant = participant_id
    ? getParticipant(participant_id)
    : getFirstParticipant();

  if (!participant) {
    res.status(404).json({ error: "participant not found" });
    return;
  }

  const session = createSession(participant.id);
  sessions.set(session.session_id, session);
  insertSession(session.session_id, participant.id);

  logEvent(session, "session_start", { participant_name: participant.name });

  const welcomeText = resolvePrompt("login.welcome", { name: participant.name });
  res.json({
    session_id: session.session_id,
    participant,
    recipients: getRecipients(participant.id),
    agents: getAgents(),
    prompt_text: welcomeText,
    prompt_id: "login.welcome",
    ui_update: {
      screen: "home",
      filled_slots: {},
      show_mic: true,
      is_modality_switched: false,
      task_complete: false,
      return_home: false,
    },
  });
});

app.post("/api/voice-turn", async (req, res) => {
  const { session_id, transcript } = req.body;
  const session = sessions.get(session_id);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  const participant = getParticipant(session.participant_id);
  if (!participant) {
    res.status(404).json({ error: "participant not found" });
    return;
  }

  const prevTaskType = session.task_type;
  const prevRetryCount = session.retry_count;
  const prevModality = session.is_modality_switched;

  const recipients = getRecipients(session.participant_id);
  const agents = getAgents();
  const result = await handleVoiceTurn(
    session,
    transcript,
    recipients,
    participant.pin,
    participant.balance,
    agents,
  );

  // ── Metric tracking ──────────────────────────────────
  // Detect new task start (task_type changed from null to something)
  if (!prevTaskType && session.task_type) {
    startTaskMetric(session.session_id, session.task_type);
  }

  // Detect retry (retry_count incremented)
  if (session.retry_count > prevRetryCount) {
    incrementRetry(session.session_id);
  }

  // Detect modality switch
  if (session.is_modality_switched && !prevModality) {
    incrementModalitySwitch(session.session_id);
  }

  // Detect help request from events
  const hasHelpEvent = session.events.some(
    (e) => e.kind === "classify" && (e.data as any)?.classification?.type === "help_request",
  );
  if (hasHelpEvent) {
    incrementHelp(session.session_id);
  }

  // Detect task completion
  if (result.ui_update.task_complete) {
    endTaskMetric(session.session_id, true);
    const amount = session.filled_slots["amount"] as number;
    const newBalance = participant.balance - amount;
    updateBalance(participant.id, newBalance);
    addLedgerEntry(
      participant.id,
      session.session_id,
      session.task_type!,
      amount,
      String(session.filled_slots["recipient_name"] ?? ""),
      newBalance,
    );
  }

  // Detect task abort (was active, now back to home with no completion)
  if (prevTaskType && !session.task_type && !result.ui_update.task_complete && prevTaskType !== "add_contact") {
    endTaskMetric(session.session_id, false);
  }

  // Handle add_contact completion
  if (prevTaskType === "add_contact" && session.awaiting_post_transaction) {
    const contactName = result.ui_update.filled_slots["contact_name"] as string
      ?? session.filled_slots["contact_name"] as string;
    const phoneNumber = result.ui_update.filled_slots["phone_number"] as string
      ?? session.filled_slots["phone_number"] as string;
    if (contactName && phoneNumber) {
      addRecipient(contactName, phoneNumber, session.participant_id);
    }
  }

  for (const event of session.events) {
    saveVoiceEvent(
      event.event_id,
      event.session_id,
      event.timestamp,
      event.kind,
      event.stage_id,
      event.data,
    );
  }
  session.events = [];

  res.json(result);
});

app.post("/api/tap", async (req, res) => {
  const { session_id, tap_type, tap_value } = req.body;
  const session = sessions.get(session_id);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  const prevTaskType = session.task_type;
  const prevRetryCount = session.retry_count;
  const prevModality = session.is_modality_switched;

  const participant = getParticipant(session.participant_id)!;
  const recipients = getRecipients(session.participant_id);
  const agents = getAgents();
  const result = await handleTapSelection(
    session,
    tap_type,
    tap_value,
    recipients,
    participant.pin,
    participant.balance,
    agents,
  );

  // ── Metric tracking ──────────────────────────────────
  if (!prevTaskType && session.task_type) {
    startTaskMetric(session.session_id, session.task_type);
  }

  if (session.retry_count > prevRetryCount) {
    incrementRetry(session.session_id);
  }

  if (session.is_modality_switched && !prevModality) {
    incrementModalitySwitch(session.session_id);
  }

  if (result.ui_update.task_complete) {
    endTaskMetric(session.session_id, true);
    const amount = session.filled_slots["amount"] as number;
    if (amount) {
      const newBalance = participant.balance - amount;
      updateBalance(participant.id, newBalance);
      addLedgerEntry(
        participant.id,
        session.session_id,
        session.task_type!,
        amount,
        String(session.filled_slots["recipient_name"] ?? ""),
        newBalance,
      );
    }
  }

  if (prevTaskType && !session.task_type && !result.ui_update.task_complete && prevTaskType !== "add_contact") {
    endTaskMetric(session.session_id, false);
  }

  // Handle add_contact completion
  if (prevTaskType === "add_contact" && session.awaiting_post_transaction) {
    const contactName = result.ui_update.filled_slots["contact_name"] as string;
    const phoneNumber = result.ui_update.filled_slots["phone_number"] as string;
    if (contactName && phoneNumber) {
      addRecipient(contactName, phoneNumber, session.participant_id);
    }
  }

  for (const event of session.events) {
    saveVoiceEvent(
      event.event_id,
      event.session_id,
      event.timestamp,
      event.kind,
      event.stage_id,
      event.data,
    );
  }
  session.events = [];

  res.json(result);
});

// ── Instrumentation / Export routes ─────────────────────

app.get("/api/metrics/:sessionId", (req, res) => {
  const metrics = getMetricsForSession(req.params.sessionId);
  res.json(metrics);
});

app.get("/api/events/:sessionId", (req, res) => {
  const events = getVoiceEventsForSession(req.params.sessionId).map((e: any) => ({
    ...e,
    data: typeof e.data_json === "string" ? JSON.parse(e.data_json) : e.data_json,
    data_json: undefined,
  }));
  res.json(events);
});

app.get("/api/export/:sessionId", (req, res) => {
  const exported = exportSession(req.params.sessionId);
  if (!exported) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json(exported);
});

// ── WebSocket (for future low-latency audio streaming) ────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocket client connected");

  ws.on("message", (data: Buffer) => {
    // Future: handle raw audio streaming for real-time STT
    // For now, REST /api/voice-turn handles text transcripts
    ws.send(JSON.stringify({ status: "ws_connected", message: "ওয়েবসকেট সংযুক্ত" }));
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

// ── Serve React client build in production ────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// ── Start ─────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Kotha server running on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/health`);
});
