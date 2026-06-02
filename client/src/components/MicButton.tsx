interface MicButtonProps {
  state: "idle" | "listening" | "speaking";
  onPress: () => void;
  disabled?: boolean;
}

export function MicButton({ state, onPress, disabled }: MicButtonProps) {
  if (disabled) return null;

  const icon = state === "listening" ? "🎙️" : state === "speaking" ? "🔊" : "🎤";

  return (
    <div className="mic-container">
      <button
        className={`mic-button ${state}`}
        onClick={onPress}
        disabled={state === "speaking"}
        aria-label={
          state === "listening" ? "শুনছি..." : state === "speaking" ? "বলছি..." : "কথা বলুন"
        }
      >
        {icon}
      </button>
    </div>
  );
}
