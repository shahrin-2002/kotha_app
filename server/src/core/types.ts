export interface TaskPlan {
  plan_id: string;
  task_type: string;
  required_slots: string[];
  max_retries_per_step: number;
  stages: PlanStage[];
}

export interface PlanStage {
  stage_id: string;
  slot_to_fill: string | null;
  primary_prompt_id: string;
  prompt_template_vars?: string[];
  expected_input_type: string;
  ui_config: Record<string, unknown>;
  validation?: ValidationRules;
  branches: Record<string, PlanBranch>;
}

export interface ValidationRules {
  min?: number;
  max?: number;
  exceeds_balance_prompt_id?: string;
  below_min_prompt_id?: string;
  above_max_prompt_id?: string;
}

export interface PlanBranch {
  action: string;
  next_stage?: string;
  prompt_id?: string;
  attempt_2_prompt_id?: string;
  attempt_3_action?: string;
  modality_switch_prompt_id?: string;
  clear_slot?: string;
  sub_branches?: Record<string, PlanBranch>;
  timeout_ms?: number;
  second_timeout_ms?: number;
  fallback_action?: string;
  max_attempts?: number;
  final_failure_action?: string;
}

export type ClassificationType =
  | "valid_slot"
  | "confirmed"
  | "denied"
  | "cancelled"
  | "ambiguous"
  | "unrecognized"
  | "silent"
  | "help_request"
  | "repeat_request"
  | "change_request";

export interface InputClassification {
  type: ClassificationType;
  extracted_slot?: string | number;
  slot_type?: string;
  confidence: number;
  raw_transcript: string;
  ambiguous_matches?: string[];
}

export interface SessionContext {
  session_id: string;
  participant_id: string;
  task_type: string | null;
  current_stage_id: string | null;
  filled_slots: Record<string, string | number>;
  retry_count: number;
  is_modality_switched: boolean;
  task_started_at: string | null;
  awaiting_post_transaction: boolean;
  events: VoiceEvent[];
}

export interface VoiceEvent {
  event_id: string;
  session_id: string;
  timestamp: string;
  kind: string;
  stage_id: string | null;
  data: Record<string, unknown>;
}

export interface OrchestratorResponse {
  prompt_text: string;
  prompt_id: string;
  ui_update: {
    screen: string;
    filled_slots: Record<string, string | number>;
    show_mic: boolean;
    is_modality_switched: boolean;
    task_complete: boolean;
    return_home: boolean;
  };
  session: SessionContext;
}

export interface Participant {
  id: string;
  name: string;
  pin: string;
  balance: number;
  created_at: string;
}

export interface Recipient {
  id: string;
  name: string;
  phone: string;
  photo_url: string;
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  location: string;
}
