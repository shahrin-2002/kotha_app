interface Props {
  onStart: () => void;
}

export function OnboardingPage({ onStart }: Props) {
  return (
    <div className="page">
      <div className="onboarding-card">
        <div className="onboarding-icon">👋</div>
        <h1 className="onboarding-title">কোথা-তে স্বাগতম</h1>
        <p className="onboarding-subtitle">
          মোবাইল ব্যাংকিং শেখার সহজ উপায়
        </p>
        <p className="onboarding-desc">
          এখানে আপনি নিরাপদে টাকা পাঠানো, ক্যাশ আউট, রিচার্জ এবং ব্যালেন্স দেখা অনুশীলন করতে পারবেন।
        </p>
        <button className="btn btn-confirm onboarding-btn" onClick={onStart}>
          শুরু করুন
        </button>
      </div>
    </div>
  );
}
