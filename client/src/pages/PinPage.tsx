import { useState, useEffect, useRef } from "react";

interface Props {
  promptText: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

export function PinPage({ promptText, onSubmit, onCancel }: Props) {
  const [stage, setStage] = useState<"waiting" | "scanning" | "success">("waiting");
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (stage === "scanning") {
      const timer = setTimeout(() => {
        setStage("success");
        setTimeout(() => onSubmitRef.current("1234"), 600);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="fingerprint-card">
        <div
          className={`fingerprint-icon ${stage}`}
          onClick={() => { if (stage === "waiting") setStage("scanning"); }}
        >
          {stage === "success" ? "✅" : "🔒"}
        </div>
        <div className="fingerprint-label">
          {stage === "waiting" && "আঙুল রাখুন"}
          {stage === "scanning" && "যাচাই হচ্ছে..."}
          {stage === "success" && "যাচাই সফল!"}
        </div>
        {stage === "waiting" && (
          <button
            className="fingerprint-touch"
            onClick={() => setStage("scanning")}
          >
            👆 আঙুল রাখুন
          </button>
        )}
      </div>
      {stage === "waiting" && (
        <button
          className="btn btn-deny"
          style={{ marginTop: "1rem" }}
          onClick={onCancel}
        >
          বাতিল
        </button>
      )}
    </div>
  );
}
