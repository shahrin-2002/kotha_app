import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
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
  addAgent,
  getFirstParticipant,
  getParticipant,
  updateBalance,
  addLedgerEntry,
  saveVoiceEvent,
  createParticipant,
  getParticipantByPhone,
  setParticipantSecret,
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

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kotha API</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background:#0f172a; color:#e2e8f0; }
    .card { text-align:center; padding:2.5rem 3rem; background:#1e293b; border-radius:16px;
      box-shadow:0 10px 40px rgba(0,0,0,.4); max-width:420px; }
    .logo { font-size:2.4rem; font-weight:700; margin-bottom:.25rem; }
    .status { display:inline-flex; align-items:center; gap:.5rem; margin:1rem 0;
      background:#064e3b; color:#6ee7b7; padding:.4rem .9rem; border-radius:999px; font-weight:600; }
    .dot { width:.6rem; height:.6rem; border-radius:50%; background:#34d399; box-shadow:0 0 0 0 rgba(52,211,153,.7);
      animation:pulse 1.8s infinite; }
    @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(52,211,153,.6)} 70%{box-shadow:0 0 0 10px rgba(52,211,153,0)} 100%{box-shadow:0 0 0 0 rgba(52,211,153,0)} }
    .sub { color:#94a3b8; font-size:.95rem; line-height:1.5; }
    code { background:#0f172a; padding:.15rem .4rem; border-radius:6px; color:#93c5fd; font-size:.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">কথা</div>
    <div class="status"><span class="dot"></span> API চালু আছে · running</div>
    <p class="sub">This is the Kotha backend API server.<br/>Use the mobile app to interact with it.</p>
    <p class="sub">Health check: <code>/api/health</code></p>
  </div>
</body>
</html>`);
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", bangla_test: "কথা চালু আছে" });
});

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY ?? "";
// Bengali voice on Cartesia Sonic-3 (default: "Pooja - Everyday Assistant").
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID ?? "59ba7dee-8f9a-432f-a6c0-ffb33666b654";
if (CARTESIA_API_KEY) console.log("Cartesia Bangla TTS enabled (sonic-3)");

async function cartesiaTTS(text: string): Promise<Buffer | null> {
  if (!CARTESIA_API_KEY) return null;
  // Retry so a transient failure doesn't drop us to the (different) Google voice.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": CARTESIA_API_KEY,
          "Cartesia-Version": "2024-11-13",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-3",
          transcript: text,
          voice: { mode: "id", id: CARTESIA_VOICE_ID },
          language: "bn",
          output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
        }),
      });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      console.error(`[Cartesia TTS] attempt ${attempt} status ${r.status}: ${(await r.text()).slice(0, 120)}`);
    } catch (e: any) {
      console.error(`[Cartesia TTS] attempt ${attempt} error:`, e.message);
    }
  }
  return null;
}

async function googleTTS(text: string): Promise<Buffer | null> {
  try {
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=bn&client=gtx&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

app.get("/api/tts", async (req, res) => {
  const text = req.query.text as string;
  if (!text) {
    res.status(400).json({ error: "text required" });
    return;
  }
  try {
    // Prefer Cartesia Sonic-3 (natural Bangla); fall back to Google Translate TTS.
    const audio = (await cartesiaTTS(text)) ?? (await googleTTS(text));
    if (!audio) {
      res.status(502).json({ error: "TTS failed" });
      return;
    }
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(audio);
  } catch {
    res.status(502).json({ error: "TTS error" });
  }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
let openaiClient: OpenAI | null = null;
if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log("OpenAI Whisper STT enabled (fallback)");
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";
if (GOOGLE_API_KEY) console.log("Google Speech-to-Text enabled (bn-BD)");

// Google Cloud Speech-to-Text (Bangla) — better on names/numbers than Whisper.
async function googleSTT(audio: Buffer): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const r = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: { encoding: "WEBM_OPUS", sampleRateHertz: 48000, languageCode: "bn-BD", maxAlternatives: 1, model: "default" },
        audio: { content: audio.toString("base64") },
      }),
    });
    if (!r.ok) {
      console.error("[Google STT]", r.status, (await r.text()).slice(0, 160));
      return null;
    }
    const data: any = await r.json();
    return ((data?.results ?? []).map((x: any) => x?.alternatives?.[0]?.transcript ?? "").join(" ")).trim();
  } catch (e: any) {
    console.error("[Google STT error]", e.message);
    return null;
  }
}

async function openaiSTT(audio: Buffer): Promise<string | null> {
  if (!openaiClient) return null;
  try {
    const file = new File([audio], "audio.webm", { type: "audio/webm" });
    const tr = await openaiClient.audio.transcriptions.create({
      file, model: "gpt-4o-transcribe", language: "bn", temperature: 0,
      prompt: "এটি বাংলা ভাষায় মোবাইল ব্যাংকিং কথোপকথন। ব্যবহারকারী বাংলায় কমান্ড বলছেন যেমন টাকা পাঠাও, ক্যাশ আউট, রিচার্জ, বিল দাও, ব্যালেন্স।",
    });
    return (tr.text ?? "").trim();
  } catch (e: any) {
    console.error("[OpenAI STT error]", e.message);
    return null;
  }
}

app.post("/api/stt", async (req, res) => {
  if (!GOOGLE_API_KEY && !openaiClient) {
    res.status(503).json({ error: "STT not configured" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length < 1000) { res.json({ transcript: "" }); return; }

    // Prefer Google bn-BD; fall back to OpenAI only if Google errors.
    let t: string | null = await googleSTT(audioBuffer);
    if (t === null) t = await openaiSTT(audioBuffer);
    if (t === null) { res.json({ transcript: "" }); return; }
    t = t.trim();

    const isHallucination = t.length > 60 || t.includes("সাবটাইটেল") || t.includes("subscribe");
    if (isHallucination) { console.log("[STT] hallucination filtered"); res.json({ transcript: "" }); return; }

    // Strictly Bangla: reject wrong scripts (Arabic/Devanagari/CJK/Cyrillic/Hangul/Thai)
    const WRONG_SCRIPT = /[؀-ۿऀ-ॿ一-鿿Ѐ-ӿ가-힯฀-๿]/;
    if (WRONG_SCRIPT.test(t)) { console.log(`[STT] non-Bangla rejected: "${t.slice(0, 40)}"`); res.json({ transcript: "" }); return; }

    console.log(`[STT] "${t}"`);
    res.json({ transcript: t });
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

// ── Account system: register + login (mobile + PIN) ──────

function sessionResponse(participant: ReturnType<typeof getParticipant>) {
  const p = participant!;
  const session = createSession(p.id);
  sessions.set(session.session_id, session);
  insertSession(session.session_id, p.id);
  logEvent(session, "session_start", { participant_name: p.name });
  return {
    session_id: session.session_id,
    participant: p,
    recipients: getRecipients(p.id),
    agents: getAgents(),
    prompt_text: resolvePrompt("login.welcome", { name: p.name }),
    prompt_id: "login.welcome",
    ui_update: {
      screen: "home",
      filled_slots: {},
      show_mic: true,
      is_modality_switched: false,
      task_complete: false,
      return_home: false,
    },
  };
}

app.post("/api/register", (req, res) => {
  const { name, phone, pin } = req.body;
  if (!name || !phone || !pin || String(pin).length !== 4) {
    res.status(400).json({ error: "নাম, নম্বর এবং চার সংখ্যার পিন দিন।" });
    return;
  }
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length !== 11 || !digits.startsWith("01")) {
    res.status(400).json({ error: "১১ সংখ্যার সঠিক মোবাইল নম্বর দিন।" });
    return;
  }
  const existing = getParticipantByPhone(digits);
  if (existing) {
    // Re-link this number to a new device/fingerprint secret (practice app — no PIN recovery).
    setParticipantSecret(existing.id, String(pin), String(name));
    const refreshed = getParticipant(existing.id)!;
    res.json(sessionResponse(refreshed));
    return;
  }
  const participant = createParticipant(String(name), String(pin), digits);
  res.json(sessionResponse(participant));
});

app.post("/api/login", (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) {
    res.status(400).json({ error: "নম্বর এবং পিন দিন।" });
    return;
  }
  const digits = String(phone).replace(/\D/g, "");
  const participant = getParticipantByPhone(digits);
  if (!participant || participant.pin !== String(pin)) {
    res.status(401).json({ error: "নম্বর বা পিন সঠিক নয়।" });
    return;
  }
  res.json(sessionResponse(participant));
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

  const welcomeText = resolvePrompt("home.welcome");
  res.json({
    session_id: session.session_id,
    participant,
    recipients: getRecipients(),
    agents: getAgents(),
    prompt_text: welcomeText,
    prompt_id: "home.welcome",
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
      String(session.filled_slots["recipient_name"] ?? session.filled_slots["biller"] ?? ""),
      newBalance,
    );
  }

  // Detect task abort (was active, now back to home with no completion)
  if (prevTaskType && !session.task_type && !result.ui_update.task_complete && prevTaskType !== "add_contact" && prevTaskType !== "add_agent") {
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

  // Handle add_agent completion
  if (prevTaskType === "add_agent" && session.awaiting_post_transaction) {
    const agentName = result.ui_update.filled_slots["agent_name"] as string
      ?? session.filled_slots["agent_name"] as string;
    const agentPhone = result.ui_update.filled_slots["phone_number"] as string
      ?? session.filled_slots["phone_number"] as string;
    if (agentName && agentPhone) {
      addAgent(agentName, agentPhone);
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
        String(session.filled_slots["recipient_name"] ?? session.filled_slots["biller"] ?? ""),
        newBalance,
      );
    }
  }

  if (prevTaskType && !session.task_type && !result.ui_update.task_complete && prevTaskType !== "add_contact" && prevTaskType !== "add_agent") {
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

  // Handle add_agent completion
  if (prevTaskType === "add_agent" && session.awaiting_post_transaction) {
    const agentName = result.ui_update.filled_slots["agent_name"] as string;
    const agentPhone = result.ui_update.filled_slots["phone_number"] as string;
    if (agentName && agentPhone) {
      addAgent(agentName, agentPhone);
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

// ── Start ─────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Kotha server running on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/health`);
});
