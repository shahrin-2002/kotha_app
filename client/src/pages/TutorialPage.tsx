interface TutorialStep {
  instruction: string;
  highlight?: string;
}

interface Props {
  promptText: string;
  steps: TutorialStep[];
  currentStep: number;
  onNext: () => void;
}

export function TutorialPage({ promptText, steps, currentStep, onNext }: Props) {
  const step = steps[currentStep] ?? steps[0];
  const isLast = currentStep >= steps.length - 1;

  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="tutorial-step">
        <div className="tutorial-step-number">
          ধাপ {toBanglaDigit(currentStep + 1)} / {toBanglaDigit(steps.length)}
        </div>
        <div className="tutorial-instruction">{step.instruction}</div>
        {step.highlight && (
          <div className="tutorial-highlight">{step.highlight}</div>
        )}
      </div>
      <button className="btn btn-confirm" onClick={onNext}>
        {isLast ? "শেষ করুন" : "পরবর্তী"}
      </button>
    </div>
  );
}

function toBanglaDigit(n: number): string {
  const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => banglaDigits[parseInt(d)]);
}
