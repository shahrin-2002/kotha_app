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

type Stage = "loading" | "enter" | "working" | "success" | "error";

// Everything is auto-generated and hidden behind the fingerprint — the user types nothing.
function gen4(): string { return String(Math.floor(1000 + Math.random() * 9000)); }
function genPhone(): string {
  let d = "01";
  for (let i = 0; i < 9; i++) d += Math.floor(Math.random() * 10);
  return d;
}

export function LoginPage({ onLogin }: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState("");
  const [welcomeName, setWelcomeName] = useState("");
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const triedRef = useRef(false);
  const spokenRef = useRef("");

  const speak = useCallback((text: string) => {
    try {
      const audio = new Audio(`${API_BASE}/api/tts?text=${encodeURIComponent(text)}`);
      audio.play().catch(() => {});
    } catch { /* autoplay may need first tap */ }
  }, []);

  useEffect(() => {
    if (stage === "enter" && spokenRef.current !== "enter") {
      spokenRef.current = "enter";
      speak("প্রবেশ করতে আঙুলের ছাপ দিন।");
    }
  }, [stage, speak]);

  const finish = useCallback((session: SessionData) => {
    setWelcomeName(session.participant.name);
    setStage("success");
    speak(`স্বাগতম, ${session.participant.name}।`);
    setTimeout(() => onLoginRef.current(session), 1300);
  }, [speak]);

  const authenticate = useCallback(async () => {
    setError("");
    setStage("working");
    try {
      // 1) real fingerprint check
      await NativeBiometric.verifyIdentity({ reason: "প্রবেশ করুন", title: "কথা", subtitle: "আঙুলের ছাপ দিন" });

      // 2) existing account on this device? → log in
      try {
        const creds = await NativeBiometric.getCredentials({ server: BIO_SERVER });
        if (creds?.username && creds?.password) {
          const res = await fetch(`${API_BASE}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: creds.username, pin: creds.password }),
          });
          if (res.ok) { finish(await res.json()); return; }
        }
      } catch { /* no linked account yet */ }

      // 3) first time on this device → create a hidden account behind the fingerprint
      const phone = genPhone();
      const secret = gen4();
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "গ্রাহক", phone, pin: secret }),
      });
      if (!res.ok) { setError("সার্ভারে সমস্যা। আবার চেষ্টা করুন।"); setStage("enter"); return; }
      try { await NativeBiometric.setCredentials({ username: phone, password: secret, server: BIO_SERVER }); } catch { /* ignore */ }
      finish(await res.json());
    } catch {
      setError("আঙুলের ছাপ মেলেনি। আবার চেষ্টা করুন।");
      setStage("enter");
    }
  }, [finish]);

  // Detect biometric availability on mount, then auto-prompt once
  useEffect(() => {
    (async () => {
      let available = false;
      try { available = !!(await NativeBiometric.isAvailable()).isAvailable; } catch { available = false; }
      setStage("enter");
      if (available && !triedRef.current) {
        triedRef.current = true;
        // slight delay so the screen renders before the OS dialog
        setTimeout(() => authenticate(), 400);
      }
    })();
  }, [authenticate]);

  if (stage === "loading" || stage === "working") {
    return (
      <div className="page login-page">
        <div className="login-header">কথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon scanning">🔒</div>
          <div className="fingerprint-label">{stage === "working" ? "যাচাই হচ্ছে..." : "লোড হচ্ছে..."}</div>
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

  // enter stage — single fingerprint button, nothing to type
  return (
    <div className="page login-page">
      <div className="login-header">কথা</div>
      <div className="login-subtitle">আঙুলের ছাপ দিয়ে প্রবেশ করুন</div>
      <div className="fingerprint-card">
        <div className="fingerprint-icon waiting">👆</div>
        {error && <div style={{ color: "var(--danger)", margin: "0.5rem 0" }}>{error}</div>}
        <button className="btn btn-confirm" style={{ width: "100%", maxWidth: 300, marginTop: "0.5rem" }} onClick={authenticate}>
          👆 আঙুলের ছাপ দিন
        </button>
      </div>
    </div>
  );
}
