import { useState, useEffect, useRef, useCallback } from "react";
import { NativeBiometric } from "capacitor-native-biometric";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const BIO_SERVER = "ai.customgpt.kotha";

interface Participant {
  id: string;
  name: string;
  phone?: string;
  balance: number;
}

interface SessionData {
  session_id: string;
  participant: Participant;
  recipients: any[];
  agents: any[];
  prompt_text: string;
  prompt_id: string;
  ui_update: any;
}

interface Props {
  onLogin: (sessionData: SessionData) => void;
}

type Stage = "loading" | "landing" | "create" | "working" | "success" | "error";

function gen4(): string { return String(Math.floor(1000 + Math.random() * 9000)); }

export function LoginPage({ onLogin }: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [welcomeName, setWelcomeName] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const spokenRef = useRef("");

  const speak = useCallback((text: string) => {
    try {
      const audio = new Audio(`${API_BASE}/api/tts?text=${encodeURIComponent(text)}`);
      audio.play().catch(() => {});
    } catch { /* autoplay may need first tap */ }
  }, []);

  useEffect(() => {
    const lines: Record<string, string> = {
      landing: "প্রবেশ করতে আঙুলের ছাপ দিন, অথবা নতুন একাউন্ট খুলুন।",
      create: "নতুন একাউন্ট খুলতে আপনার নাম ও মোবাইল নম্বর দিন, তারপর আঙুলের ছাপ দিন।",
    };
    const line = lines[stage];
    if (line && spokenRef.current !== stage) {
      spokenRef.current = stage;
      speak(line);
    }
  }, [stage, speak]);

  const finish = useCallback((session: SessionData) => {
    setWelcomeName(session.participant.name);
    setStage("success");
    speak(`স্বাগতম, ${session.participant.name}।`);
    setTimeout(() => onLoginRef.current(session), 1300);
  }, [speak]);

  // Login to the account already linked on this device
  const biometricLogin = useCallback(async () => {
    setError("");
    try {
      const existing = await NativeBiometric.getCredentials({ server: BIO_SERVER }).catch(() => null);
      if (!existing?.username || !existing?.password) {
        setError("এই ফোনে কোনো একাউন্ট নেই। নতুন একাউন্ট খুলুন।");
        return;
      }
      await NativeBiometric.verifyIdentity({ reason: "প্রবেশ করুন", title: "কথা", subtitle: "আঙুলের ছাপ দিন" });
      setStage("working");
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: existing.username, pin: existing.password }),
      });
      if (!res.ok) { setError("একাউন্ট পাওয়া যায়নি। নতুন একাউন্ট খুলুন।"); setStage("landing"); return; }
      finish(await res.json());
    } catch {
      setError("আঙুলের ছাপ মেলেনি। আবার চেষ্টা করুন।");
      setStage("landing");
    }
  }, [finish]);

  // Create a new account (name + mobile), link fingerprint, save to DB
  const createAccount = useCallback(async () => {
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (!name.trim() || digits.length !== 11 || !digits.startsWith("01")) {
      setError("নাম ও সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।");
      return;
    }
    setStage("working");
    try {
      if (bioAvailable) {
        await NativeBiometric.verifyIdentity({ reason: "একাউন্ট নিশ্চিত করুন", title: "কথা", subtitle: "আঙুলের ছাপ দিন" });
      }
      const secret = gen4();
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: digits, pin: secret }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "একাউন্ট তৈরি ব্যর্থ।"); setStage("create"); return; }
      if (bioAvailable) {
        try { await NativeBiometric.setCredentials({ username: digits, password: secret, server: BIO_SERVER }); } catch { /* ignore */ }
      }
      finish(data);
    } catch {
      setError("আঙুলের ছাপ প্রয়োজন। আবার চেষ্টা করুন।");
      setStage("create");
    }
  }, [name, phone, bioAvailable, finish]);

  // On mount: just detect availability + whether an account is linked. Do NOT auto-prompt.
  useEffect(() => {
    (async () => {
      let available = false;
      try { available = !!(await NativeBiometric.isAvailable()).isAvailable; } catch { available = false; }
      setBioAvailable(available);
      let linked = false;
      if (available) {
        try {
          const creds = await NativeBiometric.getCredentials({ server: BIO_SERVER });
          linked = !!(creds?.username && creds?.password);
        } catch { linked = false; }
      }
      setHasAccount(linked);
      setStage("landing");
    })();
  }, []);

  // ── UI ──────────────────────────────────────────────────

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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 340 }}>
          <input className="login-input" type="text" placeholder="আপনার নাম" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="login-input" type="tel" inputMode="numeric" maxLength={11} placeholder="মোবাইল নম্বর (০১...)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          {error && <div style={{ color: "var(--danger)", textAlign: "center" }}>{error}</div>}
          <button className="btn btn-confirm" style={{ width: "100%" }} onClick={createAccount}>
            👆 আঙুলের ছাপ দিয়ে একাউন্ট খুলুন
          </button>
          <button className="fingerprint-touch" style={{ opacity: 0.85 }} onClick={() => { setError(""); setStage("landing"); }}>
            ← ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  // landing — choose: login (fingerprint) or create account
  return (
    <div className="page login-page">
      <div className="login-header">কথা</div>
      <div className="login-subtitle">স্বাগতম</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", width: "100%", maxWidth: 320, alignItems: "center" }}>
        <div className="fingerprint-icon waiting" style={{ marginBottom: "0.5rem" }}>👆</div>
        {error && <div style={{ color: "var(--danger)", textAlign: "center" }}>{error}</div>}
        <button className="btn btn-confirm" style={{ width: "100%" }} onClick={biometricLogin}>
          👆 আঙুলের ছাপ দিয়ে প্রবেশ করুন
        </button>
        <button className="btn" style={{ width: "100%", background: "var(--card-bg)", color: "var(--primary)", border: "2px solid var(--primary)" }} onClick={() => { setError(""); setName(""); setPhone(""); setStage("create"); }}>
          ＋ নতুন একাউন্ট খুলুন
        </button>
      </div>
    </div>
  );
}
