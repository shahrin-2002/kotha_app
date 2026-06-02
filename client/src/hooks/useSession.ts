import { useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface Participant {
  id: string;
  name: string;
  balance: number;
}

interface Recipient {
  id: string;
  name: string;
  phone: string;
  photo_url: string;
}

interface Agent {
  id: string;
  name: string;
  phone: string;
  location: string;
}

interface UIUpdate {
  screen: string;
  filled_slots: Record<string, string | number>;
  show_mic: boolean;
  is_modality_switched: boolean;
  task_complete: boolean;
  return_home: boolean;
}

interface SessionState {
  sessionId: string | null;
  participant: Participant | null;
  recipients: Recipient[];
  agents: Agent[];
  promptText: string;
  promptId: string;
  uiUpdate: UIUpdate;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_UI: UIUpdate = {
  screen: "home",
  filled_slots: {},
  show_mic: true,
  is_modality_switched: false,
  task_complete: false,
  return_home: false,
};

export function useSession() {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    participant: null,
    recipients: [],
    agents: [],
    promptText: "",
    promptId: "",
    uiUpdate: DEFAULT_UI,
    isLoading: false,
    error: null,
  });

  const startSession = useCallback(async (participantId?: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId }),
      });
      const data = await res.json();
      setState((s) => ({
        ...s,
        sessionId: data.session_id,
        participant: data.participant,
        recipients: data.recipients,
        agents: data.agents ?? [],
        promptText: data.prompt_text,
        promptId: data.prompt_id,
        uiUpdate: data.ui_update,
        isLoading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: "সার্ভারে সংযোগ করা যাচ্ছে না।",
      }));
    }
  }, []);

  const loadSessionData = useCallback((data: any) => {
    setState((s) => ({
      ...s,
      sessionId: data.session_id,
      participant: data.participant,
      recipients: data.recipients,
      agents: data.agents ?? [],
      promptText: data.prompt_text,
      promptId: data.prompt_id,
      uiUpdate: data.ui_update,
      isLoading: false,
      error: null,
    }));
  }, []);

  const sendTranscript = useCallback(
    async (transcript: string) => {
      if (!state.sessionId) return;
      setState((s) => ({ ...s, isLoading: true }));
      try {
        const res = await fetch(`${API_BASE}/api/voice-turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: state.sessionId,
            transcript,
          }),
        });
        const data = await res.json();
        setState((s) => ({
          ...s,
          promptText: data.prompt_text,
          promptId: data.prompt_id,
          uiUpdate: data.ui_update,
          isLoading: false,
        }));
        return data.prompt_text as string;
      } catch {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: "সার্ভারে সংযোগ করা যাচ্ছে না।",
        }));
      }
    },
    [state.sessionId]
  );

  const sendTap = useCallback(
    async (tapType: string, tapValue: string) => {
      if (!state.sessionId) return;
      setState((s) => ({ ...s, isLoading: true }));
      try {
        const res = await fetch(`${API_BASE}/api/tap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: state.sessionId,
            tap_type: tapType,
            tap_value: tapValue,
          }),
        });
        const data = await res.json();
        setState((s) => ({
          ...s,
          promptText: data.prompt_text,
          promptId: data.prompt_id,
          uiUpdate: data.ui_update,
          isLoading: false,
        }));
        return data.prompt_text as string;
      } catch {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: "সার্ভারে সংযোগ করা যাচ্ছে না।",
        }));
      }
    },
    [state.sessionId]
  );

  return {
    ...state,
    startSession,
    loadSessionData,
    sendTranscript,
    sendTap,
  };
}
