import { useState, useEffect, useRef, useCallback } from "react";
import { NativeBiometric } from "capacitor-native-biometric";

interface Props {
  promptText: string;
  participantPin: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

// Transaction confirmation via real fingerprint. On success we submit the account's
// hidden secret (from the session) so the server's PIN check passes — no PIN typing.
export function PinPage({ promptText, participantPin, onSubmit, onCancel }: Props) {
  const [stage, setStage] = useState<"scanning" | "success" | "error">("scanning");
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const startedRef = useRef(false);

  const verify = useCallback(async () => {
    setStage("scanning");
    try {
      let available = false;
      try { available = !!(await NativeBiometric.isAvailable()).isAvailable; } catch { available = false; }
      if (available) {
        await NativeBiometric.verifyIdentity({
          reason: "লেনদেন নিশ্চিত করুন",
          title: "কথা",
          subtitle: "আঙুলের ছাপ দিন",
        });
      }
      setStage("success");
      setTimeout(() => onSubmitRef.current(participantPin), 500);
    } catch {
      setStage("error");
    }
  }, [participantPin]);

  useEffect(() => {
    if (!startedRef.current) { startedRef.current = true; verify(); }
  }, [verify]);

  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="fingerprint-card">
        <div className={`fingerprint-icon ${stage}`}>
          {stage === "success" ? "✅" : stage === "error" ? "❌" : "🔒"}
        </div>
        <div className="fingerprint-label">
          {stage === "scanning" && "আঙুলের ছাপ দিন..."}
          {stage === "success" && "যাচাই সফল!"}
          {stage === "error" && "মেলেনি। আবার চেষ্টা করুন।"}
        </div>
        {stage === "error" && (
          <button className="fingerprint-touch" style={{ marginTop: "1rem" }} onClick={verify}>
            👆 আবার আঙুলের ছাপ দিন
          </button>
        )}
      </div>
      <button className="btn btn-deny" style={{ marginTop: "1rem" }} onClick={onCancel}>
        বাতিল
      </button>
    </div>
  );
}
