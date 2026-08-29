import { useState } from "react";

interface Props {
  promptText: string;
  onSubmit: (accountNumber: string) => void;
  onCancel: () => void;
}

const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

const toBanglaDigits = (s: string): string => {
  return s.replace(/[0-9]/g, (d) => BANGLA_DIGITS[parseInt(d)]);
};

const MIN_LEN = 5;
const MAX_LEN = 17;

export function EnterAccountPage({ promptText, onSubmit, onCancel }: Props) {
  const [number, setNumber] = useState("");

  const handleDigit = (digit: number) => {
    if (number.length < MAX_LEN) {
      setNumber((n) => n + String(digit));
    }
  };

  const handleDelete = () => {
    setNumber((n) => n.slice(0, -1));
  };

  const handleSubmit = () => {
    if (number.length >= MIN_LEN) {
      onSubmit(number);
      setNumber("");
    }
  };

  const displayNumber = number.length > 0 ? toBanglaDigits(number) : "বিলের নম্বর লিখুন";

  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="number-display">
        <span className={number.length > 0 ? "" : "placeholder"}>
          {displayNumber}
        </span>
      </div>
      <div className="pin-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} className="pin-key" onClick={() => handleDigit(d)}>
            {BANGLA_DIGITS[d]}
          </button>
        ))}
        <button className="pin-key danger" onClick={onCancel}>
          ✗
        </button>
        <button className="pin-key" onClick={() => handleDigit(0)}>
          {BANGLA_DIGITS[0]}
        </button>
        <button className="pin-key danger" onClick={handleDelete}>
          ←
        </button>
      </div>
      <button
        className="btn btn-confirm"
        style={{ width: "100%", maxWidth: "300px", marginTop: "0.5rem" }}
        onClick={handleSubmit}
        disabled={number.length < MIN_LEN}
      >
        পরবর্তী
      </button>
    </div>
  );
}
