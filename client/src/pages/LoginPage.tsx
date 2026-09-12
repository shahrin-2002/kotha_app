import { useState, useEffect, useRef, useCallback } from "react";
import { NativeBiometric } from "capacitor-native-biometric";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const BIO_SERVER = "ai.customgpt.kotha";

interface Participant { id: string; name: string; phone?: string; balance: number; }
interface SessionData {
  session_id: string; participant: Participant; recipients: any[]; agents: any[];
  prompt_text: string; prompt_id: string; ui_update: any;
}
interface Props { onLogin: (s: SessionData) => void; }

type Stage = "loading" | "landing" | "create" | "working" | "success";

const BN2A: Record<string, string> = { "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9" };
function toDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => BN2A[d] ?? d).replace(/\D/g, "");
}
function gen4(): string { return String(Math.floor(1000 + Math.random() * 9000)); }
const wantsCreate = (t: string) => /(নতুন|খুল|নাই|নেই|তৈরি|রেজিস্ট|create|new|no)/i.test(t);
const wantsLogin = (t: string) => /(লগইন|লগ\s*ইন|প্রবেশ|আছে|ঢুক|পুরান|আগের|login|yes)/i.test(t);

export function LoginPage({ onLogin }: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [welcomeName, setWelcomeName] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRunRef = useRef("");
  const nameRef = useRef(""); nameRef.current = name;
  const phoneRef = useRef(""); phoneRef.current = phone;

  // ── voice helpers ──────────────────────────────────────
  const speakAsync = useCallback((text: string) => new Promise<void>((resolve) => {
    try {
      if (audioRef.current) { audioRef.current.pause(); }
      const a = new Audio(`${API_BASE}/api/tts?text=${encodeURIComponent(text)}`);
      audioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    } catch { resolve(); }
  }), []);

  const ensureMic = useCallback(async () => {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      ctxRef.current = ctx;
      analyserRef.current = an;
      console.log("[login-voice] mic OK, ctx=" + ctx.state);
      return true;
    } catch (e: any) {
      console.log("[login-voice] mic FAILED: " + (e?.message || e));
      return false;
    }
  }, []);

  const listenOnce = useCallback((maxMs = 6000, silenceMs = 900) => new Promise<string>(async (resolve) => {
    const ok = await ensureMic();
    if (!ok || !streamRef.current || !analyserRef.current) { resolve(""); return; }
    setStatus("🎤 শুনছি...");
    const stream = streamRef.current;
    const analyser = analyserRef.current;
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" }); }
    catch { resolve(""); return; }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      console.log("[login-voice] recorded " + blob.size + " bytes");
      if (blob.size < 1200) { setStatus(""); console.log("[login-voice] too small, skip"); resolve(""); return; }
      setStatus("⏳ সংযোগ হচ্ছে...");
      try {
        const r = await fetch(`${API_BASE}/api/stt`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob });
        const d = await r.json();
        console.log("[login-voice] STT -> \"" + (d.transcript || "") + "\"");
        resolve((d.transcript || "").trim());
      } catch (e: any) { console.log("[login-voice] STT error: " + (e?.message || e)); resolve(""); }
    };
    console.log("[login-voice] recording started");
    rec.start(100);
    const data = new Uint8Array(analyser.fftSize);
    let started = false, silenceStart = 0, maxDev = 0;
    const t0 = Date.now();
    let raf = 0;
    const stop = (reason: string) => {
      console.log(`[login-voice] stop (${reason}) started=${started} maxLevel=${maxDev}`);
      cancelAnimationFrame(raf);
      if (rec.state === "recording") { try { rec.stop(); } catch {} }
    };
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let dev = 0;
      for (let i = 0; i < data.length; i++) { const d = Math.abs(data[i] - 128); if (d > dev) dev = d; }
      if (dev > maxDev) maxDev = dev;
      const now = Date.now();
      if (dev > 3) { started = true; silenceStart = 0; }
      else if (started) { if (!silenceStart) silenceStart = now; else if (now - silenceStart > silenceMs) { stop("silence"); return; } }
      if (now - t0 > maxMs) { stop("maxtime"); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }), [ensureMic]);

  // ── auth actions ───────────────────────────────────────
  const finish = useCallback((session: SessionData) => {
    setWelcomeName(session.participant.name);
    setStage("success");
    setTimeout(() => onLoginRef.current(session), 1300);
  }, []);

  const goCreate = useCallback(() => { setError(""); setStage("create"); }, []);

  const biometricLogin = useCallback(async () => {
    setError("");
    const existing = await NativeBiometric.getCredentials({ server: BIO_SERVER }).catch(() => null);
    if (!existing?.username || !existing?.password) {
      setError("এই ফোনে কোনো একাউন্ট নেই। আগে একাউন্ট খুলুন।");
      await speakAsync("এই ফোনে কোনো একাউন্ট পাওয়া যায়নি। আঙুলের ছাপ মেলেনি। অনুগ্রহ করে আগে একাউন্ট খুলুন।");
      goCreate();
      return;
    }
    try {
      await NativeBiometric.verifyIdentity({ reason: "প্রবেশ করুন", title: "কথা", subtitle: "আঙুলের ছাপ দিন" });
    } catch {
      setError("আঙুলের ছাপ মেলেনি। আবার চেষ্টা করুন।");
      await speakAsync("আঙুলের ছাপ মেলেনি। আবার চেষ্টা করুন।");
      return;
    }
    setStage("working");
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: existing.username, pin: existing.password }),
      });
      if (!res.ok) {
        setError("একাউন্ট পাওয়া যায়নি। আগে একাউন্ট খুলুন।");
        await speakAsync("একাউন্ট পাওয়া যায়নি। অনুগ্রহ করে আগে একাউন্ট খুলুন।");
        goCreate();
        return;
      }
      finish(await res.json());
    } catch {
      setError("সার্ভারে সংযোগ করা যাচ্ছে না।");
      setStage("landing");
    }
  }, [speakAsync, goCreate, finish]);

  const createAccount = useCallback(async () => {
    setError("");
    const nm = nameRef.current.trim();
    const digits = toDigits(phoneRef.current);
    if (!nm || digits.length !== 11 || !digits.startsWith("01")) {
      setError("নাম ও সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।");
      await speakAsync("নাম ও সঠিক এগারো সংখ্যার মোবাইল নম্বর দিন।");
      return;
    }
    setStage("working");
    try {
      if (bioAvailable) {
        await NativeBiometric.verifyIdentity({ reason: "একাউন্ট নিশ্চিত করুন", title: "কথা", subtitle: "আঙুলের ছাপ দিন" });
      }
      const secret = gen4();
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, phone: digits, pin: secret }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "একাউন্ট তৈরি ব্যর্থ।"); setStage("create"); return; }
      if (bioAvailable) {
        try { await NativeBiometric.setCredentials({ username: digits, password: secret, server: BIO_SERVER }); } catch {}
      }
      finish(data);
    } catch {
      setError("আঙুলের ছাপ প্রয়োজন। আবার চেষ্টা করুন।");
      setStage("create");
    }
  }, [bioAvailable, speakAsync, finish]);

  // ── voice dialogs per screen ───────────────────────────
  const runLanding = useCallback(async () => {
    await ensureMic();
    await speakAsync("কথায় স্বাগতম। আপনার কি একাউন্ট আছে? থাকলে বলুন লগইন। নতুন হলে বলুন নতুন একাউন্ট।");
    const t = await listenOnce(6000, 1000);
    setStatus(t ? `শুনলাম: ${t}` : "");
    if (wantsCreate(t)) { goCreate(); return; }
    if (wantsLogin(t)) { biometricLogin(); return; }
    await speakAsync("বুঝতে পারিনি। নিচের বোতাম থেকে বেছে নিন — প্রবেশ করুন অথবা নতুন একাউন্ট।");
  }, [ensureMic, speakAsync, listenOnce, goCreate, biometricLogin]);

  const runCreate = useCallback(async () => {
    await ensureMic();
    await speakAsync("নতুন একাউন্ট খুলি। আপনার নাম বলুন।");
    const n = await listenOnce(7000, 1200);
    if (n) { setName(n); setStatus(`নাম: ${n}`); }
    // Phone numbers are recited with pauses between digit groups — allow long gaps + window
    await speakAsync("এবার আপনার মোবাইল নম্বরটি ধীরে ধীরে বলুন।");
    const p = await listenOnce(14000, 2500);
    const d = toDigits(p);
    if (d) { setPhone(d); setStatus(`নম্বর: ${d}`); }
    await speakAsync("নাম ও নম্বর দেখে নিন। ঠিক থাকলে আঙুলের ছাপ দিন, নয়তো টাইপ করে ঠিক করুন।");
  }, [speakAsync, listenOnce]);

  // run the right voice dialog when a screen appears
  useEffect(() => {
    if (stage === "landing" && stageRunRef.current !== "landing") { stageRunRef.current = "landing"; runLanding(); }
    if (stage === "create" && stageRunRef.current !== "create") { stageRunRef.current = "create"; runCreate(); }
  }, [stage, runLanding, runCreate]);

  // mount: detect biometric, then show landing
  useEffect(() => {
    // Wake the (free-tier) Render server immediately so it's ready by the time
    // the user answers — avoids the ~40s cold-start dead wait on the first command.
    fetch(`${API_BASE}/api/health`).catch(() => {});
    (async () => {
      let available = false;
      try { available = !!(await NativeBiometric.isAvailable()).isAvailable; } catch { available = false; }
      setBioAvailable(available);
      ensureMic(); // warm the mic + trigger the permission prompt up front
      setStage("landing");
    })();
  }, []);

  // ── UI ──────────────────────────────────────────────────
  const caption = status ? <div className="login-subtitle" style={{ color: "var(--primary)" }}>{status}</div> : null;

  if (stage === "loading" || stage === "working") {
    return (
      <div className="page login-page">
        <div className="login-header">কথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon scanning">🔒</div>
          <div className="fingerprint-label">{stage === "working" ? "প্রক্রিয়া চলছে..." : "লোড হচ্ছে..."}</div>
        </div>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="page login-page">
        <div className="login-header">কথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon success">✅</div>
          <div className="fingerprint-label">স্বাগতম, {welcomeName}!</div>
        </div>
      </div>
    );
  }

  if (stage === "create") {
    return (
      <div className="page login-page">
        <div className="login-header">কথা</div>
        <div className="login-subtitle">নতুন একাউন্ট খুলুন</div>
        {caption}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 340 }}>
          <input className="login-input" type="text" placeholder="আপনার নাম (বলুন বা লিখুন)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="login-input" type="tel" inputMode="numeric" maxLength={11} placeholder="মোবাইল নম্বর (বলুন বা লিখুন)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          {error && <div style={{ color: "var(--danger)", textAlign: "center" }}>{error}</div>}
          <button className="btn btn-confirm" style={{ width: "100%" }} onClick={createAccount}>👆 আঙুলের ছাপ দিয়ে একাউন্ট খুলুন</button>
          <button className="fingerprint-touch" style={{ opacity: 0.85 }} onClick={() => { stageRunRef.current = ""; runCreate(); }}>🎤 আবার বলুন</button>
          <button className="fingerprint-touch" style={{ opacity: 0.7 }} onClick={() => { setError(""); setStage("landing"); }}>← ফিরে যান</button>
        </div>
      </div>
    );
  }

  // landing
  return (
    <div className="page login-page">
      <div className="login-header">কথা</div>
      <div className="login-subtitle">স্বাগতম</div>
      {caption}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", width: "100%", maxWidth: 320, alignItems: "center" }}>
        <div className="fingerprint-icon waiting" style={{ marginBottom: "0.3rem" }}>👆</div>
        {error && <div style={{ color: "var(--danger)", textAlign: "center" }}>{error}</div>}
        <button className="btn btn-confirm" style={{ width: "100%" }} onClick={biometricLogin}>👆 আঙুলের ছাপ দিয়ে প্রবেশ করুন</button>
        <button className="btn" style={{ width: "100%", background: "var(--card-bg)", color: "var(--primary)", border: "2px solid var(--primary)" }} onClick={goCreate}>＋ নতুন একাউন্ট খুলুন</button>
        <button className="fingerprint-touch" style={{ opacity: 0.8 }} onClick={() => { stageRunRef.current = ""; runLanding(); }}>🎤 আবার শুনুন</button>
      </div>
    </div>
  );
}
