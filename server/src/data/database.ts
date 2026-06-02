import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { v4 as uuid } from "uuid";
import type { Participant, Recipient, Agent } from "../core/types.js";

const DB_PATH = join(import.meta.dirname, "../../data/kotha.db");

let db: SqlJsDatabase;

function save(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(DB_PATH, buffer);
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL DEFAULT '1234',
      balance INTEGER NOT NULL DEFAULT 5000,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recipients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      photo_url TEXT NOT NULL DEFAULT '',
      participant_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT ''
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      counterparty TEXT NOT NULL,
      balance_after INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS voice_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      kind TEXT NOT NULL,
      stage_id TEXT,
      data_json TEXT NOT NULL DEFAULT '{}'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      help_count INTEGER NOT NULL DEFAULT 0,
      modality_switches INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  seedIfEmpty();
  save();
  console.log("Database initialized at", DB_PATH);
}

function seedIfEmpty(): void {
  const result = db.exec("SELECT COUNT(*) as c FROM recipients");
  const count = result.length > 0 ? (result[0].values[0][0] as number) : 0;
  if (count > 0) return;

  const recipients = [
    { name: "করিম", phone: "01712345678", photo_url: "/recipients/karim.png" },
    { name: "রহিমা", phone: "01812345679", photo_url: "/recipients/rahima.png" },
    { name: "জামাল", phone: "01912345680", photo_url: "/recipients/jamal.png" },
    { name: "ফাতেমা", phone: "01612345681", photo_url: "/recipients/fatema.png" },
    { name: "সালমা", phone: "01512345682", photo_url: "/recipients/salma.png" },
  ];

  for (const r of recipients) {
    db.run("INSERT INTO recipients (id, name, phone, photo_url) VALUES (?, ?, ?, ?)", [
      uuid(), r.name, r.phone, r.photo_url,
    ]);
  }

  const agents = [
    { name: "হাসান এজেন্ট", phone: "01711111111", location: "বাজার" },
    { name: "মিনা এজেন্ট", phone: "01822222222", location: "স্কুলের পাশে" },
    { name: "রফিক এজেন্ট", phone: "01933333333", location: "মসজিদের পাশে" },
  ];

  for (const a of agents) {
    db.run("INSERT INTO agents (id, name, phone, location) VALUES (?, ?, ?, ?)", [
      uuid(), a.name, a.phone, a.location,
    ]);
  }

  const participants = [
    { name: "আয়েশা", pin: "1234" },
    { name: "ফাতেমা", pin: "2345" },
    { name: "রুমানা", pin: "3456" },
  ];

  for (const p of participants) {
    db.run("INSERT INTO participants (id, name, pin, balance) VALUES (?, ?, ?, ?)", [
      uuid(), p.name, p.pin, 5000,
    ]);
  }

  save();
  console.log("Seeded 5 recipients, 3 agents, and 3 participants");
}

function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql: string, params: any[] = []): any | undefined {
  const rows = queryAll(sql, params);
  return rows[0];
}

export function getRecipients(participantId?: string): Recipient[] {
  if (participantId) {
    return queryAll(
      "SELECT id, name, phone, photo_url FROM recipients WHERE participant_id IS NULL OR participant_id = ?",
      [participantId],
    ) as Recipient[];
  }
  return queryAll("SELECT id, name, phone, photo_url FROM recipients") as Recipient[];
}

export function addRecipient(name: string, phone: string, participantId?: string): Recipient {
  const id = uuid();
  db.run(
    "INSERT INTO recipients (id, name, phone, participant_id) VALUES (?, ?, ?, ?)",
    [id, name, phone, participantId ?? null],
  );
  save();
  return { id, name, phone, photo_url: "" };
}

export function getAgents(): Agent[] {
  return queryAll("SELECT id, name, phone, location FROM agents") as Agent[];
}

export function getParticipant(id: string): Participant | undefined {
  return queryOne("SELECT * FROM participants WHERE id = ?", [id]) as Participant | undefined;
}

export function getFirstParticipant(): Participant | undefined {
  return queryOne("SELECT * FROM participants ORDER BY created_at LIMIT 1") as Participant | undefined;
}

export function updateBalance(participantId: string, newBalance: number): void {
  db.run("UPDATE participants SET balance = ? WHERE id = ?", [newBalance, participantId]);
  save();
}

export function addLedgerEntry(
  participantId: string,
  sessionId: string,
  taskType: string,
  amount: number,
  counterparty: string,
  balanceAfter: number,
): void {
  db.run(
    "INSERT INTO ledger (id, participant_id, session_id, task_type, amount, counterparty, balance_after) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uuid(), participantId, sessionId, taskType, amount, counterparty, balanceAfter],
  );
  save();
}

export function saveVoiceEvent(
  eventId: string,
  sessionId: string,
  timestamp: string,
  kind: string,
  stageId: string | null,
  data: Record<string, unknown>,
): void {
  db.run(
    "INSERT INTO voice_events (id, session_id, timestamp, kind, stage_id, data_json) VALUES (?, ?, ?, ?, ?, ?)",
    [eventId, sessionId, timestamp, kind, stageId, JSON.stringify(data)],
  );
  save();
}

export function createParticipant(name: string, pin: string): Participant {
  const id = uuid();
  const created_at = new Date().toISOString();
  db.run("INSERT INTO participants (id, name, pin, balance, created_at) VALUES (?, ?, ?, ?, ?)", [
    id, name, pin, 5000, created_at,
  ]);
  save();
  return { id, name, pin, balance: 5000, created_at };
}

export function getAllParticipants(): Participant[] {
  return queryAll("SELECT * FROM participants ORDER BY created_at") as Participant[];
}

// ── Metrics CRUD ─────────────────────────────────────────

export function insertMetric(
  id: string,
  sessionId: string,
  taskType: string,
  startedAt: string,
): void {
  db.run(
    "INSERT INTO metrics (id, session_id, task_type, started_at) VALUES (?, ?, ?, ?)",
    [id, sessionId, taskType, startedAt],
  );
  save();
}

export function updateMetric(
  id: string,
  fields: Record<string, unknown>,
): void {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  db.run(`UPDATE metrics SET ${setClauses.join(", ")} WHERE id = ?`, values as any[]);
  save();
}

export function getActiveMetricForSession(sessionId: string): any | undefined {
  return queryOne(
    "SELECT * FROM metrics WHERE session_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [sessionId],
  );
}

export function getMetricsForSession(sessionId: string): any[] {
  return queryAll("SELECT * FROM metrics WHERE session_id = ? ORDER BY started_at", [sessionId]);
}

// ── Voice Events queries ─────────────────────────────────

export function getVoiceEventsForSession(sessionId: string): any[] {
  return queryAll("SELECT * FROM voice_events WHERE session_id = ? ORDER BY timestamp", [sessionId]);
}

// ── Session queries ──────────────────────────────────────

export function getSession(sessionId: string): any | undefined {
  return queryOne("SELECT * FROM sessions WHERE id = ?", [sessionId]);
}

export function insertSession(sessionId: string, participantId: string): void {
  db.run(
    "INSERT INTO sessions (id, participant_id) VALUES (?, ?)",
    [sessionId, participantId],
  );
  save();
}

// ── Credential (WebAuthn) queries ───────────────────────

export function storeCredential(participantId: string, credentialId: string, publicKey: string): void {
  db.run(
    "INSERT INTO credentials (id, participant_id, credential_id, public_key) VALUES (?, ?, ?, ?)",
    [uuid(), participantId, credentialId, publicKey],
  );
  save();
}

export function getParticipantIdByCredential(credentialId: string): string | null {
  const row = queryOne("SELECT participant_id FROM credentials WHERE credential_id = ?", [credentialId]);
  return row?.participant_id ?? null;
}

export function hasAnyCredentials(): boolean {
  const result = db.exec("SELECT COUNT(*) as c FROM credentials");
  const count = result.length > 0 ? (result[0].values[0][0] as number) : 0;
  return count > 0;
}

export function getAllCredentialIds(): string[] {
  return queryAll("SELECT credential_id FROM credentials").map((r: any) => r.credential_id);
}
