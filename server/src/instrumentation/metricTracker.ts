import { v4 as uuid } from "uuid";
import {
  insertMetric,
  updateMetric,
  getActiveMetricForSession,
} from "../data/database.js";

/**
 * Start tracking a new task metric for a session.
 * Any previously open (un-ended) metric for this session is auto-closed
 * as unsuccessful before the new one begins.
 */
export function startTaskMetric(sessionId: string, taskType: string): string {
  // Close any dangling open metric
  const existing = getActiveMetricForSession(sessionId);
  if (existing) {
    const now = new Date().toISOString();
    const durationMs = new Date(now).getTime() - new Date(existing.started_at).getTime();
    updateMetric(existing.id, {
      ended_at: now,
      success: 0,
      duration_ms: durationMs,
    });
  }

  const id = uuid();
  const startedAt = new Date().toISOString();
  insertMetric(id, sessionId, taskType, startedAt);
  return id;
}

/**
 * End the currently active task metric for a session.
 */
export function endTaskMetric(sessionId: string, success: boolean): void {
  const metric = getActiveMetricForSession(sessionId);
  if (!metric) return;

  const now = new Date().toISOString();
  const durationMs = new Date(now).getTime() - new Date(metric.started_at).getTime();
  updateMetric(metric.id, {
    ended_at: now,
    success: success ? 1 : 0,
    duration_ms: durationMs,
  });
}

/**
 * Increment the retry counter on the active metric.
 */
export function incrementRetry(sessionId: string): void {
  const metric = getActiveMetricForSession(sessionId);
  if (!metric) return;
  updateMetric(metric.id, { retry_count: (metric.retry_count ?? 0) + 1 });
}

/**
 * Increment the help-request counter on the active metric.
 */
export function incrementHelp(sessionId: string): void {
  const metric = getActiveMetricForSession(sessionId);
  if (!metric) return;
  updateMetric(metric.id, { help_count: (metric.help_count ?? 0) + 1 });
}

/**
 * Increment the modality-switch counter on the active metric.
 */
export function incrementModalitySwitch(sessionId: string): void {
  const metric = getActiveMetricForSession(sessionId);
  if (!metric) return;
  updateMetric(metric.id, { modality_switches: (metric.modality_switches ?? 0) + 1 });
}
