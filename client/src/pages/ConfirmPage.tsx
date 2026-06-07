interface Props {
  promptText: string;
  recipientName: string;
  recipientPhone?: string;
  amount: number;
  taskType?: string;
  onConfirm: () => void;
  onDeny: () => void;
}

const toBanglaDigits = (n: number | string): string => {
  const bd = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => bd[parseInt(d)]);
};

const amountToBanglaWords = (n: number): string => {
  const parts: string[] = [];
  if (n >= 100000) { parts.push(`${toBanglaDigits(Math.floor(n / 100000))} লাখ`); n %= 100000; }
  if (n >= 1000) { parts.push(`${toBanglaDigits(Math.floor(n / 1000))} হাজার`); n %= 1000; }
  if (n >= 100) { parts.push(`${toBanglaDigits(Math.floor(n / 100))}শো`); n %= 100; }
  if (n > 0) parts.push(toBanglaDigits(n));
  return parts.join(" ");
};

const taskLabel = (type?: string): string => {
  switch (type) {
    case "send_money": return "টাকা পাঠানো";
    case "cash_out": return "ক্যাশ আউট";
    case "recharge": return "রিচার্জ";
    default: return "লেনদেন";
  }
};

export function ConfirmPage({ promptText, recipientName, recipientPhone, amount, taskType, onConfirm, onDeny }: Props) {
  const isLargeAmount = amount >= 5000;

  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="confirm-card" style={{ border: isLargeAmount ? "3px solid #ea4335" : undefined }}>
        <div style={{ fontSize: "0.9rem", color: "#5f6368", marginBottom: "0.5rem" }}>
          {taskLabel(taskType)}
        </div>
        <div className="recipient" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          {recipientName}-কে
        </div>
        {recipientPhone && (
          <div style={{ fontSize: "1rem", color: "#5f6368", marginTop: "0.2rem" }}>
            {toBanglaDigits(recipientPhone)}
          </div>
        )}
        <div className="amount" style={{ fontSize: "2rem", fontWeight: 700, color: isLargeAmount ? "#ea4335" : "#1a73e8", margin: "0.8rem 0" }}>
          ৳{toBanglaDigits(amount)}
        </div>
        <div style={{ fontSize: "1rem", color: "#5f6368", marginBottom: "0.8rem" }}>
          ({amountToBanglaWords(amount)} টাকা)
        </div>
        {isLargeAmount && (
          <div style={{
            background: "#fce8e6",
            color: "#c5221f",
            padding: "0.5rem 0.8rem",
            borderRadius: "8px",
            fontSize: "0.95rem",
            fontWeight: 600,
            marginBottom: "0.8rem",
            textAlign: "center",
          }}>
            ⚠️ বড় অংকের টাকা — ভালো করে দেখে নিন
          </div>
        )}
        <div className="confirm-buttons">
          <button className="btn btn-confirm" onClick={onConfirm}>
            হ্যাঁ, পাঠান ✓
          </button>
          <button className="btn btn-deny" onClick={onDeny}>
            না, বাতিল ✗
          </button>
        </div>
      </div>
    </div>
  );
}
