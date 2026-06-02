interface Props {
  promptText: string;
  onSelect: (operator: string) => void;
}

const OPERATORS = [
  { id: "grameenphone", icon: "🟢", label: "গ্রামীণফোন" },
  { id: "robi", icon: "🔴", label: "রবি" },
  { id: "banglalink", icon: "🟠", label: "বাংলালিংক" },
  { id: "teletalk", icon: "🔵", label: "টেলিটক" },
];

export function SelectOperatorPage({ promptText, onSelect }: Props) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="operator-grid">
        {OPERATORS.map((op) => (
          <button
            key={op.id}
            className="icon-tile"
            onClick={() => onSelect(op.id)}
          >
            <span className="tile-icon">{op.icon}</span>
            <span className="tile-label">{op.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
