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

export function LoginPage({ onLogin }: Props) {
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  useEffect(() => {
    loadParticipants();
  }, []);

  async function loadParticipants() {
    try {
      const res = await fetch(`${API_BASE}/api/participants`);
      const data = await res.json();
      setParticipants(data);
      setStage("ready");
    } catch {
      setErrorMsg("সার্ভারে সংযোগ করা যাচ্ছে না।");
      setStage("error");
    }
  }

  const handleSelect = useCallback(async (participant: Participant) => {
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participant.id }),
      });
      if (!res.ok) {
        setErrorMsg("সেশন তৈরি করা যায়নি।");
        setStage("error");
        return;
      }
      const sessionData: SessionData = await res.json();
      onLoginRef.current(sessionData);
    } catch {
      setErrorMsg("সার্ভারে সংযোগ করা যাচ্ছে না।");
      setStage("error");
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
        <div style={{ color: "var(--danger)", textAlign: "center", padding: "1rem" }}>{errorMsg}</div>
        <button className="account-tile" onClick={() => { setErrorMsg(""); setStage("loading"); loadParticipants(); }}>
          আবার চেষ্টা করুন
        </button>
      </div>
    );
  }

  return (
    <div className="page login-page">
      <div className="login-header">কোথা</div>
      <div className="login-subtitle">একাউন্ট বাছুন</div>
      <div className="account-list">
        {participants.map((p) => (
          <button key={p.id} className="account-tile" onClick={() => handleSelect(p)}>
            <span className="account-avatar">👤</span>
            <span className="account-name">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
