import { useEffect, useRef } from "react";

interface Transaction {
  type: string;
  amount: number;
  counterparty: string;
  date: string;
}

interface Props {
  promptText: string;
  balance: number;
  transactions?: Transaction[];
  onAutoAdvance: () => void;
}

const toBanglaDigits = (n: number | string): string => {
  const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => banglaDigits[parseInt(d)]);
};

const txTypeLabel = (type: string): string => {
  switch (type) {
    case "send_money":
      return "পাঠানো";
    case "cash_out":
      return "ক্যাশ আউট";
    case "recharge":
      return "রিচার্জ";
    case "received":
      return "প্রাপ্ত";
    default:
      return type;
  }
};

export function BalancePage({ promptText, balance, transactions, onAutoAdvance }: Props) {
  const onAutoAdvanceRef = useRef(onAutoAdvance);
  onAutoAdvanceRef.current = onAutoAdvance;

  useEffect(() => {
    const timer = setTimeout(() => onAutoAdvanceRef.current(), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="balance-display">
        <div className="balance-label">আপনার বর্তমান ব্যালেন্স</div>
        <div className="balance-amount">৳{toBanglaDigits(balance)}</div>
      </div>
      {transactions && transactions.length > 0 && (
        <div className="transaction-list">
          <div className="transaction-header">সর্বশেষ লেনদেন</div>
          {transactions.map((tx, i) => (
            <div key={i} className="transaction-item">
              <span className="transaction-type">{txTypeLabel(tx.type)}</span>
              <span className="transaction-counterparty">{tx.counterparty}</span>
              <span className="transaction-amount">৳{toBanglaDigits(tx.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
