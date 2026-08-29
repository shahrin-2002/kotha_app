import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface Participant {
  id: string;
  name: string;
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

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function LoginPage({ onLogin }: Props) {
  const [stage, setStage] = useState<"loading" | "login" | "register" | "scanning" | "success" | "error" | "skip">("loading");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [, setSelectedParticipant] = useState<Participant | null>(null);
  const [welcomeName, setWelcomeName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  const loginTriggeredRef = useRef(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Auto-trigger fingerprint login once when stage becomes "login"
  useEffect(() => {
    if (stage === "login" && !loginTriggeredRef.current) {
      loginTriggeredRef.current = true;
      speakTTS("আঙুল দিন").then(() => {
        handleFingerprintLogin();
      });
    }
  }, [stage]);

  async function speakTTS(text: string) {
    try {
      const url = `${API_BASE}/api/tts?text=${encodeURIComponent(text)}`;
      const audio = new Audio(url);
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch {}
  }

  async function checkAuthStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/status`);
      const { has_credentials } = await res.json();

      // Always load participants so the "skip fingerprint" picker has accounts
      const pRes = await fetch(`${API_BASE}/api/participants`);
      const data = await pRes.json();
      setParticipants(data);

      if (has_credentials) {
        setStage("login");
      } else {
        setStage("register");
      }
    } catch {
      setErrorMsg("সার্ভারে সংযোগ করা যাচ্ছে না।");
      setStage("error");
    }
  }

  // Dev bypass: log in with a test account without fingerprint (uses /api/sessions)
  const handleSkipLogin = useCallback(async (participant: Participant) => {
    try {
      setStage("scanning");
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participant.id }),
      });
      if (!res.ok) throw new Error("session failed");
      const sessionData: SessionData = await res.json();
      setWelcomeName(sessionData.participant.name);
      setStage("success");
      setTimeout(() => onLoginRef.current(sessionData), 1000);
    } catch {
      setErrorMsg("প্রবেশ ব্যর্থ হয়েছে।");
      setStage("error");
    }
  }, []);

  const handleFingerprintLogin = useCallback(async () => {
    try {
      setStage("scanning");

      const optRes = await fetch(`${API_BASE}/api/auth/login-options`, { method: "POST" });
      const options = await optRes.json();

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToBuffer(options.challenge),
          rpId: options.rpId,
          userVerification: options.userVerification,
          timeout: options.timeout,
        },
      }) as PublicKeyCredential;

      const verifyRes = await fetch(`${API_BASE}/api/auth/login-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential_id: credential.id }),
      });

      if (!verifyRes.ok) {
        setErrorMsg("আঙুল চিনতে পারিনি। আবার চেষ্টা করুন।");
        setStage("error");
        return;
      }

      const sessionData: SessionData = await verifyRes.json();
      setWelcomeName(sessionData.participant.name);
      setStage("success");
      setTimeout(() => onLoginRef.current(sessionData), 1500);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setErrorMsg("বাতিল হয়েছে। আবার চেষ্টা করুন।");
        setStage("error");
        return;
      }
      setErrorMsg("আঙুল চিনতে পারিনি। আবার চেষ্টা করুন।");
      setStage("error");
    }
  }, []);

  const handleRegister = useCallback(async (participant: Participant) => {
    try {
      setSelectedParticipant(participant);
      setStage("scanning");

      const optRes = await fetch(`${API_BASE}/api/auth/register-options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participant.id }),
      });
      const options = await optRes.json();

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: base64urlToBuffer(options.challenge),
          rp: options.rp,
          user: {
            ...options.user,
            id: base64urlToBuffer(options.user.id),
          },
          pubKeyCredParams: options.pubKeyCredParams,
          authenticatorSelection: options.authenticatorSelection,
          timeout: options.timeout,
        },
      }) as PublicKeyCredential;

      await fetch(`${API_BASE}/api/auth/register-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: participant.id,
          credential_id: credential.id,
        }),
      });

      // Now auto-login
      const loginOptRes = await fetch(`${API_BASE}/api/auth/login-options`, { method: "POST" });
      const loginOpts = await loginOptRes.json();

      const loginCred = await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToBuffer(loginOpts.challenge),
          rpId: loginOpts.rpId,
          userVerification: loginOpts.userVerification,
          timeout: loginOpts.timeout,
        },
      }) as PublicKeyCredential;

      const verifyRes = await fetch(`${API_BASE}/api/auth/login-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential_id: loginCred.id }),
      });

      const sessionData: SessionData = await verifyRes.json();
      setWelcomeName(sessionData.participant.name);
      setStage("success");
      setTimeout(() => onLoginRef.current(sessionData), 1500);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setStage("register");
        return;
      }
      setErrorMsg("আঙুলের ছাপ নিবন্ধন ব্যর্থ। আবার চেষ্টা করুন।");
      setStage("register");
    }
  }, []);

  if (stage === "loading") {
    return (
      <div className="page login-page">
        <div className="login-header">কোথা</div>
        <div className="fingerprint-label">লোড হচ্ছে...</div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="page login-page">
        <div className="login-header">কোথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon waiting">🔒</div>
          <div className="fingerprint-label" style={{ color: "var(--danger)" }}>{errorMsg}</div>
          <button className="fingerprint-touch" onClick={() => {
            setErrorMsg("");
            loginTriggeredRef.current = false;
            setStage("login");
          }}>
            👆 আবার আঙুল দিন
          </button>
          <button className="fingerprint-touch" style={{ marginTop: "0.75rem", opacity: 0.85 }} onClick={() => {
            setErrorMsg("");
            setStage("skip");
          }}>
            🔓 আঙুল ছাড়া প্রবেশ করুন
          </button>
        </div>
      </div>
    );
  }

  if (stage === "scanning") {
    return (
      <div className="page login-page">
        <div className="login-header">কোথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon scanning">🔒</div>
          <div className="fingerprint-label">যাচাই হচ্ছে...</div>
        </div>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="page login-page">
        <div className="login-header">কোথা</div>
        <div className="fingerprint-card">
          <div className="fingerprint-icon success">✅</div>
          <div className="fingerprint-label">স্বাগতম, {welcomeName}!</div>
        </div>
      </div>
    );
  }

  if (stage === "skip") {
    return (
      <div className="page login-page">
        <div className="login-header">কোথা</div>
        <div className="login-subtitle">আঙুল ছাড়া প্রবেশ (পরীক্ষা)</div>
        <div className="login-subtitle" style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>
          একটি একাউন্ট বাছুন
        </div>
        <div className="account-list">
          {participants.map((p) => (
            <button key={p.id} className="account-tile" onClick={() => handleSkipLogin(p)}>
              <span className="account-avatar">👤</span>
              <span className="account-name">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "register") {
    return (
      <div className="page login-page">
        <div className="login-header">কোথা</div>
        <div className="login-subtitle">আঙুলের ছাপ নিবন্ধন করুন</div>
        <div className="login-subtitle" style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>
          একাউন্ট বাছুন, তারপর আঙুল রাখুন
        </div>
        {errorMsg && <div style={{ color: "var(--danger)", textAlign: "center" }}>{errorMsg}</div>}
        <div className="account-list">
          {participants.map((p) => (
            <button key={p.id} className="account-tile" onClick={() => handleRegister(p)}>
              <span className="account-avatar">👤</span>
              <span className="account-name">{p.name}</span>
            </button>
          ))}
        </div>
        <button className="fingerprint-touch" style={{ marginTop: "1rem", opacity: 0.85 }} onClick={() => setStage("skip")}>
          🔓 আঙুল ছাড়া প্রবেশ করুন
        </button>
      </div>
    );
  }

  // stage === "login" — auto-triggers fingerprint via useEffect
  return (
    <div className="page login-page">
      <div className="login-header">কোথা</div>
      <div className="fingerprint-card">
        <div className="fingerprint-icon scanning">🔒</div>
        <div className="fingerprint-label">আঙুল দিন</div>
        {errorMsg && <div style={{ color: "var(--danger)", fontSize: "1rem", marginTop: "0.5rem" }}>{errorMsg}</div>}
        <button className="fingerprint-touch" style={{ marginTop: "1rem", opacity: 0.85 }} onClick={() => setStage("skip")}>
          🔓 আঙুল ছাড়া প্রবেশ করুন
        </button>
      </div>
    </div>
  );
}
