import { useEffect, useRef } from "react";

interface Props {
  promptText: string;
  onAutoAdvance: () => void;
}

export function ResultPage({ promptText, onAutoAdvance }: Props) {
  const onAutoAdvanceRef = useRef(onAutoAdvance);
  onAutoAdvanceRef.current = onAutoAdvance;

  useEffect(() => {
    // Give the spoken success message time to finish + a moment to read it
    // (the readback is ~5s; 5s total cut it off and jumped home too fast).
    const timer = setTimeout(() => onAutoAdvanceRef.current(), 10000);
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
