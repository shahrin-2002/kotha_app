import { useEffect, useCallback, useState, useRef } from "react";
import { useSession } from "./hooks/useSession";
import { useVoice } from "./hooks/useVoice";
import { PracticeWatermark } from "./components/PracticeWatermark";
import { MicButton } from "./components/MicButton";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SelectRecipientPage } from "./pages/SelectRecipientPage";
import { EnterAmountPage } from "./pages/EnterAmountPage";
import { ConfirmPage } from "./pages/ConfirmPage";
import { PinPage } from "./pages/PinPage";
import { ResultPage } from "./pages/ResultPage";
import { BalancePage } from "./pages/BalancePage";
import { SelectAgentPage } from "./pages/SelectAgentPage";
import { SelectOperatorPage } from "./pages/SelectOperatorPage";
import { EnterNumberPage } from "./pages/EnterNumberPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { TutorialPage } from "./pages/TutorialPage";

function App() {
  const session = useSession();
  const voice = useVoice();
  const [appState, setAppState] = useState<"login" | "active">("login");
  const lastSpokenRef = useRef("");
  const [textInput, setTextInput] = useState("");

  const handleLogin = useCallback((sessionData: any) => {
    session.loadSessionData(sessionData);
    setAppState("active");
    voice.startListening();
  }, [session.loadSessionData, voice]);

  // Speak new prompts only — track what we already spoke to avoid re-triggering
  useEffect(() => {
    if (appState !== "active") return;
    if (!session.promptText || session.isLoading) return;
    const key = session.promptId + "|" + session.promptText;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    voice.speak(session.promptText);
  }, [session.promptText, session.promptId, session.isLoading, appState]);

  // Send transcript to server when voice recognizes something
  // Block if already waiting for a response to prevent overlap
  useEffect(() => {
    const text = voice.transcript;
    if (text && appState === "active" && !session.isLoading) {
      voice.stopSpeaking();
      session.sendTranscript(text);
    }
  }, [voice.rawTranscript]);

  // When server says farewell (return_home + generic.farewell), go back to login
  useEffect(() => {
    if (session.uiUpdate.return_home && session.promptId === "generic.farewell") {
      const timer = setTimeout(() => {
        voice.stopListening();
        lastSpokenRef.current = "";
        setAppState("login");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [session.uiUpdate.return_home, session.promptId]);

  const handleMicPress = useCallback(() => {
    if (voice.voiceState === "speaking") {
      voice.stopSpeaking();
      voice.startListening();
    } else {
      voice.startListening();
    }
  }, [voice]);

  const handleTaskSelect = useCallback(
    (taskType: string) => {
      session.sendTap("task_select", taskType);
    },
    [session.sendTap]
  );

  const handleRecipientSelect = useCallback(
    (name: string) => {
      session.sendTranscript(name);
    },
    [session.sendTranscript]
  );

  const handleConfirm = useCallback(() => {
    session.sendTranscript("হ্যাঁ");
  }, [session.sendTranscript]);

  const handleDeny = useCallback(() => {
    session.sendTranscript("না");
  }, [session.sendTranscript]);

  const handlePinSubmit = useCallback(
    (pin: string) => {
      session.sendTranscript(pin);
    },
    [session.sendTranscript]
  );

  const handlePinCancel = useCallback(() => {
    session.sendTranscript("বাতিল");
  }, [session.sendTranscript]);

  const handleAutoAdvance = useCallback(() => {
    session.sendTap("auto_advance", "return_home");
  }, [session.sendTap]);

  const handleAgentSelect = useCallback(
    (name: string) => {
      session.sendTranscript(name);
    },
    [session.sendTranscript]
  );

  const handleOperatorSelect = useCallback(
    (operator: string) => {
      session.sendTap("operator_select", operator);
    },
    [session.sendTap]
  );

  const handleNumberSubmit = useCallback(
    (number: string) => {
      session.sendTranscript(number);
    },
    [session.sendTranscript]
  );

  const handleNumberCancel = useCallback(() => {
    session.sendTranscript("বাতিল");
  }, [session.sendTranscript]);

  const handleAddContact = useCallback(() => {
    session.sendTap("task_select", "add_contact");
  }, [session.sendTap]);

  const handleOnboardingStart = useCallback(() => {
    session.sendTap("onboarding", "start");
  }, [session.sendTap]);

  const handleTutorialNext = useCallback(() => {
    session.sendTap("tutorial", "next");
  }, [session.sendTap]);

  const handleTextSubmit = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    session.sendTranscript(text);
  }, [textInput, session.sendTranscript]);

  const handleQuickPhrase = useCallback((phrase: string) => {
    session.sendTranscript(phrase);
  }, [session.sendTranscript]);

  const screen = session.uiUpdate.screen;
  const slots = session.uiUpdate.filled_slots;

  if (appState === "login") {
    return (
      <>
        <PracticeWatermark />
        <header className="app-header">কোথা — অনুশীলন</header>
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      <PracticeWatermark />
      <header className="app-header">কোথা — অনুশীলন</header>

      {session.error && (
        <div className="status-bar" style={{ color: "var(--danger)" }}>
          {session.error}
        </div>
      )}

      {/* Live caption bar */}
      <div style={{
        background: voice.interimText ? "#1a73e8" : voice.transcript ? "#34a853" : "#5f6368",
        color: "white",
        padding: "0.6rem 1rem",
        textAlign: "center",
        fontSize: "1.2rem",
        fontWeight: 600,
        minHeight: "2.5rem",
      }}>
        {voice.interimText
          ? `🎤 ${voice.interimText}...`
          : voice.transcript
            ? `✅ ${voice.transcript}`
            : voice.voiceState === "listening"
              ? "🎤 বলুন..."
              : voice.voiceState === "speaking"
                ? "🔊 বলছি..."
                : ""}
      </div>

      {screen === "home" && (
        <HomePage
          onTaskSelect={handleTaskSelect}
          promptText={session.promptText}
        />
      )}

      {screen === "select_recipient" && (
        <SelectRecipientPage
          recipients={session.recipients}
          promptText={session.promptText}
          onSelect={handleRecipientSelect}
          onAddContact={handleAddContact}
        />
      )}

      {screen === "enter_amount" && (
        <EnterAmountPage
          promptText={session.promptText}
          recipientName={String(slots.recipient_name ?? "")}
        />
      )}

      {screen === "confirm" && (
        <ConfirmPage
          promptText={session.promptText}
          recipientName={String(slots.recipient_name ?? "")}
          amount={Number(slots.amount ?? 0)}
          onConfirm={handleConfirm}
          onDeny={handleDeny}
        />
      )}

      {screen === "pin_pad" && (
        <PinPage
          promptText={session.promptText}
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
        />
      )}

      {screen === "result" && (
        <ResultPage
          promptText={session.promptText}
          onAutoAdvance={handleAutoAdvance}
        />
      )}

      {screen === "balance" && (
        <BalancePage
          promptText={session.promptText}
          balance={Number(session.participant?.balance ?? 0)}
          transactions={(slots.transactions as unknown as Array<{ type: string; amount: number; counterparty: string; date: string }>) ?? undefined}
          onAutoAdvance={handleAutoAdvance}
        />
      )}

      {screen === "select_agent" && (
        <SelectAgentPage
          agents={session.agents}
          promptText={session.promptText}
          onSelect={handleAgentSelect}
        />
      )}

      {screen === "select_operator" && (
        <SelectOperatorPage
          promptText={session.promptText}
          onSelect={handleOperatorSelect}
        />
      )}

      {screen === "enter_number" && (
        <EnterNumberPage
          promptText={session.promptText}
          onSubmit={handleNumberSubmit}
          onCancel={handleNumberCancel}
        />
      )}

      {screen === "onboarding" && (
        <OnboardingPage onStart={handleOnboardingStart} />
      )}

      {screen === "tutorial" && (
        <TutorialPage
          promptText={session.promptText}
          steps={(slots.tutorial_steps as unknown as Array<{ instruction: string; highlight?: string }>) ?? [{ instruction: session.promptText }]}
          currentStep={Number(slots.tutorial_step ?? 0)}
          onNext={handleTutorialNext}
        />
      )}

      {screen !== "pin_pad" && screen !== "enter_number" && (
        <MicButton
          state={voice.voiceState}
          onPress={handleMicPress}
        />
      )}

      <div className="status-bar">
        {voice.errorMsg
          ? `⚠️ ${voice.errorMsg}`
          : voice.voiceState === "listening"
            ? "🔴 শুনছি..."
            : voice.voiceState === "speaking"
              ? "🔵 বলছি..."
              : "⚪ প্রস্তুত"}
      </div>

      {/* Text input fallback for when STT has network issues */}
      <div style={{
        background: "#fff3cd",
        padding: "0.5rem",
        borderTop: "1px solid #ffc107",
      }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "0.4rem" }}>
          {screen === "home" && <>
            <button className="quick-btn" onClick={() => handleQuickPhrase("টাকা পাঠাবো")}>টাকা পাঠাবো</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("ক্যাশ আউট")}>ক্যাশ আউট</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("রিচার্জ")}>রিচার্জ</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("ব্যালেন্স")}>ব্যালেন্স</button>
          </>}
          {screen === "select_recipient" && <>
            <button className="quick-btn" onClick={() => handleQuickPhrase("করিম")}>করিম</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("রহিমা")}>রহিমা</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("জামাল")}>জামাল</button>
          </>}
          {screen === "enter_amount" && <>
            <button className="quick-btn" onClick={() => handleQuickPhrase("একশো")}>১০০</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("দুইশো")}>২০০</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("পাঁচশো")}>৫০০</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("এক হাজার")}>১০০০</button>
          </>}
          {screen === "confirm" && <>
            <button className="quick-btn" onClick={() => handleQuickPhrase("হ্যাঁ")}>হ্যাঁ</button>
            <button className="quick-btn" onClick={() => handleQuickPhrase("না")}>না</button>
          </>}
          <button className="quick-btn" style={{ background: "#ea4335", color: "white" }} onClick={() => handleQuickPhrase("বাতিল")}>বাতিল</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleTextSubmit(); }} style={{ display: "flex", gap: "0.4rem" }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="বাংলায় টাইপ করুন..."
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              border: "2px solid #dadce0",
              borderRadius: "8px",
              fontSize: "1rem",
            }}
          />
          <button type="submit" style={{
            padding: "0.5rem 1rem",
            background: "#1a73e8",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontWeight: 600,
            cursor: "pointer",
          }}>পাঠান</button>
        </form>
      </div>
    </>
  );
}

export default App;
