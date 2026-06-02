import { saveVoiceEvent } from "../data/database.js";
import { v4 as uuid } from "uuid";

function now(): string {
  return new Date().toISOString();
}

function emit(
  sessionId: string,
  kind: string,
  stageId: string | null,
  data: Record<string, unknown>,
): void {
  saveVoiceEvent(uuid(), sessionId, now(), kind, stageId, data);
}

/** Log a speech-to-text result */
export function logSTT(
  sessionId: string,
  stageId: string | null,
  transcript: string,
  confidence: number,
): void {
  emit(sessionId, "stt", stageId, { transcript, confidence });
}

/** Log an input classification result */
export function logClassification(
  sessionId: string,
  stageId: string | null,
  classification: Record<string, unknown>,
): void {
  emit(sessionId, "classification", stageId, { classification });
}

/** Log a TTS prompt delivered to the user */
export function logTTS(
  sessionId: string,
  stageId: string | null,
  promptId: string,
  text: string,
): void {
  emit(sessionId, "tts", stageId, { prompt_id: promptId, text });
}

/** Log a UI screen transition */
export function logScreenTransition(
  sessionId: string,
  fromScreen: string,
  toScreen: string,
): void {
  emit(sessionId, "screen_transition", null, { from: fromScreen, to: toScreen });
}

/** Log the start of a task */
export function logTaskStart(
  sessionId: string,
  stageId: string | null,
  taskType: string,
): void {
  emit(sessionId, "task_start", stageId, { task_type: taskType });
}

/** Log successful completion of a task */
export function logTaskEnd(
  sessionId: string,
  stageId: string | null,
  taskType: string,
): void {
  emit(sessionId, "task_end", stageId, { task_type: taskType });
}

/** Log that a task was aborted */
export function logTaskAbort(
  sessionId: string,
  stageId: string | null,
  taskType: string,
): void {
  emit(sessionId, "task_abort", stageId, { task_type: taskType });
}
