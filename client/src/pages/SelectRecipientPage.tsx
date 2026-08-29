interface Recipient {
  id: string;
  name: string;
  phone: string;
  photo_url: string;
}

interface Props {
  recipients: Recipient[];
  promptText: string;
  onSelect: (name: string) => void;
  onAddContact?: () => void;
}

export function SelectRecipientPage({ recipients, promptText, onSelect, onAddContact }: Props) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="recipient-grid">
        {recipients.map((r) => (
          <button
            key={r.id}
            className="recipient-tile"
            onClick={() => onSelect(r.name)}
          >
            <div className="avatar">{r.name[0]}</div>
            <span className="name">{r.name}</span>
          </button>
        ))}
        {onAddContact && (
          <button
            className="recipient-tile add-contact-tile"
            onClick={onAddContact}
          >
            <div className="avatar">+</div>
            <span className="name">নতুন নম্বর</span>
          </button>
        )}
      </div>
    </div>
  );
}
