import { v4 as uuid } from "uuid";
import type { SessionContext, VoiceEvent } from "./types.js";

export function createSession(participantId: string): SessionContext {
  return {
    session_id: uuid(),
    participant_id: participantId,
    task_type: null,
    current_stage_id: null,
    filled_slots: {},
    retry_count: 0,
    is_modality_switched: false,
    task_started_at: null,
    awaiting_post_transaction: false,
    events: [],
  };
}

export function logEvent(
  session: SessionContext,
  kind: string,
  data: Record<string, unknown> = {}
): VoiceEvent {
  const event: VoiceEvent = {
    event_id: uuid(),
    session_id: session.session_id,
    timestamp: new Date().toISOString(),
    kind,
    stage_id: session.current_stage_id,
    data,
  };
  session.events.push(event);
  return event;
}

export function resetTask(session: SessionContext): void {
  session.task_type = null;
  session.current_stage_id = null;
  session.filled_slots = {};
  session.retry_count = 0;
  session.is_modality_switched = false;
  session.task_started_at = null;
  session.awaiting_post_transaction = false;
}
