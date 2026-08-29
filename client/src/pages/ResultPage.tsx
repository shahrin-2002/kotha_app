import { useEffect, useRef } from "react";

interface Props {
  promptText: string;
  onAutoAdvance: () => void;
}

export function ResultPage({ promptText, onAutoAdvance }: Props) {
  const onAutoAdvanceRef = useRef(onAutoAdvance);
  onAutoAdvanceRef.current = onAutoAdvance;

  useEffect(() => {
    const timer = setTimeout(() => onAutoAdvanceRef.current(), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="page">
      <div className="result-card">
        <div className="checkmark">✓</div>
        <p className="message">{promptText}</p>
      </div>
    </div>
  );
}
