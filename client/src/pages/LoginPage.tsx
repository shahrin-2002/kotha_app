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

type Stage = "loading" | "biometric" | "form" | "working" | "success" | "error";

// Hidden 4-digit secret generated per account — the user never sees or types it;
// it lives behind the fingerprint and is submitted automatically for login + transactions.
function genSecret(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function LoginPage({ onLogin }: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [welcomeName, setWelcomeName] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const bioTriedRef = useRef(false);
  const spokenStageRef = useRef("");

  const speak = useCallback((text: string) => {
    try {
      const audio = new Audio(`${API_BASE}/api/tts?text=${encodeURIComponent(text)}`);
      audio.play().catch(() => {});
    } catch { /* autoplay may be blocked before first tap */ }
  }, []);

  // Voice guidance on every step
  useEffect(() => {
    const lines: Record<string, string> = {
      biometric: "প্রবেশ করতে আঙুলের ছাপ দিন।",
      form: "একাউন্ট খুলতে আপনার নাম ও মোবাইল নম্বর দিন, তারপর আঙুলের ছাপ দিন।",
    };
    const line = lines[stage];
    if (line && spokenStageRef.current !== stage) {
      spokenStageRef.current = stage;
      speak(line);
    }
  }, [stage, speak]);

  const finish = useCallback((session: SessionData) => {
    setWelcomeName(session.participant.name);
    setStage("success");
    speak(`স্বাগতম, ${session.participant.name}।`);
    setTimeout(() => onLoginRef.current(session), 1300);
  }, [speak]);

  // On mount: detect biometric + any linked account on this device
  useEffect(() => {
    (async () => {
      let available = false;
      try { available = !!(await NativeBiometric.isAvailable()).isAvailable; } catch { available = false; }
      setBioAvailable(available);
      if (available) {
        try {
          const creds = await NativeBiometric.getCredentials({ server: BIO_SERVER });
          if (creds?.username && creds?.password) { setStage("biometric"); return; }
        } catch { /* none linked */ }
      }
      setStage("form");
    })();
  }, []);

  const doBiometricLogin = useCallback(async () => {
    setError("");
    try {
      await NativeBiometric.verifyIdentity({ reason: "প্রবেশ করুন", title: "কথা", subtitle: "আঙুলের ছাপ দিন" });
      const creds = await NativeBiometric.getCredentials({ server: BIO_SERVER });
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: creds.username, pin: creds.password }),
      });
      if (!res.ok) { setError("আবার একাউন্ট যুক্ত করুন।"); setStage("form"); return; }
      finish(await res.json());
    } catch {
      setError("আঙুলের ছাপ মেলেনি।");
    }
  }, [finish]);

  // Auto-trigger fingerprint on the biometric stage
  useEffect(() => {
    if (stage === "biometric" && !bioTriedRef.current) {
      bioTriedRef.current = true;
      doBiometricLogin();
    }
  }, [stage, doBiometricLogin]);

  const submitAccount = useCallback(async () => {
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
      const secret = genSecret();
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: digits, pin: secret }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "একাউন্ট তৈরি ব্যর্থ।"); setStage("form"); return; }
      if (bioAvailable) {
        try { await NativeBiometric.setCredentials({ username: digits, password: secret, server: BIO_SERVER }); } catch { /* ignore */ }
      }
      finish(data);
    } catch {
      setError("আঙুলের ছাপ প্রয়োজন। আবার চেষ্টা করুন।");
      setStage("form");
    }
  }, [name, phone, bioAvailable, finish]);

  // ── UI ──────────────────────────────────────────────────

  if (stage === "loading" || stage === "working") {
    return (
      <div className="page login-page">
        <div className="login-header">কথা</div>
        <div className="fingerprint-label">{stage === "working" ? "প্রক্রিয়া চলছে..." : "লোড হচ্ছে..."}</div>
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

  if (stage === "biometric") {
    return (
      <div className="page login-page">
        <div className="login-header">কথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon scanning">🔒</div>
          <div className="fingerprint-label">প্রবেশ করতে আঙুলের ছাপ দিন</div>
          {error && <div style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{error}</div>}
          <button className="fingerprint-touch" style={{ marginTop: "1rem" }} onClick={doBiometricLogin}>
            👆 আঙুলের ছাপ দিন
          </button>
          <button className="fingerprint-touch" style={{ marginTop: "0.6rem", opacity: 0.8 }} onClick={() => { setError(""); setStage("form"); }}>
            নতুন একাউন্ট
          </button>
        </div>
      </div>
    );
  }

  // form stage — name + mobile, then fingerprint
  return (
    <div className="page login-page">
      <div className="login-header">কথা</div>
      <div className="login-subtitle">একাউন্ট খুলুন বা প্রবেশ করুন</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 340 }}>
        <input className="login-input" type="text" placeholder="আপনার নাম" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="login-input" type="tel" inputMode="numeric" maxLength={11} placeholder="মোবাইল নম্বর (০১...)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
        {error && <div style={{ color: "var(--danger)", textAlign: "center" }}>{error}</div>}
        <button className="btn btn-confirm" style={{ width: "100%" }} onClick={submitAccount}>
          👆 আঙুলের ছাপ দিয়ে প্রবেশ করুন
        </button>
      </div>
    </div>
  );
}
