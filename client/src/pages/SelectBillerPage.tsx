interface Props {
  promptText: string;
  onSelect: (biller: string) => void;
}

const BILLERS = [
  { id: "desco", icon: "⚡", label: "ডেসকো" },
  { id: "palli", icon: "🔌", label: "পল্লী বিদ্যুৎ" },
  { id: "titas", icon: "🔥", label: "তিতাস গ্যাস" },
  { id: "wasa", icon: "💧", label: "ঢাকা ওয়াসা" },
];

export function SelectBillerPage({ promptText, onSelect }: Props) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="operator-grid">
        {BILLERS.map((b) => (
          <button
            key={b.id}
            className="icon-tile"
            onClick={() => onSelect(b.id)}
          >
            <span className="tile-icon">{b.icon}</span>
            <span className="tile-label">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
