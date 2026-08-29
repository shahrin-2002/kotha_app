interface Props {
  promptText: string;
  recipientName: string;
  amount: number;
  onConfirm: () => void;
  onDeny: () => void;
}

export function ConfirmPage({ promptText, recipientName, amount, onConfirm, onDeny }: Props) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="confirm-card">
        <div className="recipient">{recipientName}-কে</div>
        <div className="amount">৳{amount}</div>
        <div className="confirm-buttons">
          <button className="btn btn-confirm" onClick={onConfirm}>
            হ্যাঁ ✓
          </button>
          <button className="btn btn-deny" onClick={onDeny}>
            না ✗
          </button>
        </div>
      </div>
    </div>
  );
}
