interface Props {
  promptText: string;
  recipientName: string;
}

export function EnterAmountPage({ promptText, recipientName }: Props) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="confirm-card">
        <div className="recipient">{recipientName}-কে</div>
        <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>
          টাকার পরিমাণ বলুন
        </p>
      </div>
    </div>
  );
}
