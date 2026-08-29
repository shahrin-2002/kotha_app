import {
  getMetricsForSession,
  getVoiceEventsForSession,
  getParticipant,
  getSession,
} from "../data/database.js";

export interface SessionExport {
  session_summary: {
    session_id: string;
    participant_id: string;
    participant_name: string;
    started_at: string;
    ended_at: string | null;
    total_tasks: number;
    successful_tasks: number;
    success_rate: number;
    total_duration_ms: number;
  };
  metrics: MetricRow[];
  events: EventRow[];
}

interface MetricRow {
  id: string;
  session_id: string;
  task_type: string;
  started_at: string;
  ended_at: string | null;
  success: boolean;
  retry_count: number;
  help_count: number;
  modality_switches: number;
  duration_ms: number | null;
}

interface EventRow {
  id: string;
  session_id: string;
  timestamp: string;
  kind: string;
  stage_id: string | null;
  data: Record<string, unknown>;
}

/**
 * Export all instrumentation data for a session as a JSON bundle.
 *
 * The returned object contains:
 *  - session_summary (participant info, aggregate stats)
 *  - metrics (one entry per task attempt)
 *  - events (all voice_events for the session)
 */
export function exportSession(sessionId: string): SessionExport | null {
  const session = getSession(sessionId);
  if (!session) return null;

  const participant = getParticipant(session.participant_id);
  const participantName = participant?.name ?? "unknown";

  // ── Metrics ────────────────────────────────────────────
  const rawMetrics = getMetricsForSession(sessionId);
  const metrics: MetricRow[] = rawMetrics.map((m: any) => ({
    id: m.id,
    session_id: m.session_id,
    task_type: m.task_type,
    started_at: m.started_at,
    ended_at: m.ended_at ?? null,
    success: m.success === 1,
    retry_count: m.retry_count ?? 0,
    help_count: m.help_count ?? 0,
    modality_switches: m.modality_switches ?? 0,
    duration_ms: m.duration_ms ?? null,
  }));

  const totalTasks = metrics.length;
  const successfulTasks = metrics.filter((m) => m.success).length;
  const successRate = totalTasks > 0 ? successfulTasks / totalTasks : 0;
  const totalDurationMs = metrics.reduce((sum, m) => sum + (m.duration_ms ?? 0), 0);

  // ── Events ─────────────────────────────────────────────
  const rawEvents = getVoiceEventsForSession(sessionId);
  const events: EventRow[] = rawEvents.map((e: any) => ({
    id: e.id,
    session_id: e.session_id,
    timestamp: e.timestamp,
    kind: e.kind,
    stage_id: e.stage_id ?? null,
    data: typeof e.data_json === "string" ? JSON.parse(e.data_json) : (e.data_json ?? {}),
  }));

  return {
    session_summary: {
      session_id: sessionId,
      participant_id: session.participant_id,
      participant_name: participantName,
      started_at: session.started_at,
      ended_at: session.ended_at ?? null,
      total_tasks: totalTasks,
      successful_tasks: successfulTasks,
      success_rate: Math.round(successRate * 10000) / 10000, // 4 decimal places
      total_duration_ms: totalDurationMs,
    },
    metrics,
    events,
  };
}
