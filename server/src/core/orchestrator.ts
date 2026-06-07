import type {
  SessionContext,
  OrchestratorResponse,
  InputClassification,
  PlanStage,
  Recipient,
  Agent,
} from "./types.js";
import { getPlan, resolvePrompt } from "./planRegistry.js";
import { logEvent, resetTask } from "./sessionContext.js";
import { classify } from "../classifier/inputClassifier.js";

export function startTask(
  session: SessionContext,
  taskType: string,
  participantBalance?: number,
  agents?: Agent[],
): OrchestratorResponse {
  const plan = getPlan(taskType);
  if (!plan) {
    const text = resolvePrompt("generic.not_understood");
    return makeResponse(session, text, "generic.not_understood", "home", true);
  }

  session.task_type = taskType;
  session.filled_slots = {};
  session.retry_count = 0;
  session.is_modality_switched = false;
  session.task_started_at = new Date().toISOString();

  if (taskType === "check_balance" && participantBalance !== undefined) {
    session.filled_slots["balance"] = participantBalance;
  }

  if (taskType === "cash_out" && agents) {
    session.filled_slots["agents"] = agents as any;
  }

  const firstStage = plan.stages[0];
  session.current_stage_id = firstStage.stage_id;

  logEvent(session, "task_start", { task_type: taskType });

  const text = resolvePrompt(firstStage.primary_prompt_id, session.filled_slots);
  return makeResponse(session, text, firstStage.primary_prompt_id, firstStage.ui_config.screen as string);
}

export async function handleVoiceTurn(
  session: SessionContext,
  transcript: string,
  recipients: Recipient[],
  participantPin: string,
  participantBalance: number,
  agents: Agent[] = [],
): Promise<OrchestratorResponse> {
  if (session.awaiting_post_transaction) {
    if (!transcript || transcript.trim().length < 2) {
      const text = resolvePrompt("generic.anything_else");
      return makeResponse(session, text, "generic.anything_else", "home", true);
    }

    const yesNoResult = await classify(transcript, "yes_no");
    if (yesNoResult.type === "denied" || yesNoResult.type === "cancelled") {
      session.awaiting_post_transaction = false;
      logEvent(session, "classify", { classification: yesNoResult, context: "post_transaction" });
      resetTask(session);
      const text = resolvePrompt("generic.farewell");
      return makeResponse(session, text, "generic.farewell", "home", true, true);
    }

    const classification = await classify(transcript, "intent");
    logEvent(session, "classify", { classification, context: "post_transaction" });

    if (classification.type === "valid_slot" && classification.extracted_slot) {
      session.awaiting_post_transaction = false;
      return startTask(session, classification.extracted_slot as string, participantBalance, agents);
    }

    if (classification.type === "cancelled") {
      session.awaiting_post_transaction = false;
      resetTask(session);
      const text = resolvePrompt("generic.farewell");
      return makeResponse(session, text, "generic.farewell", "home", true, true);
    }

    const text = resolvePrompt("generic.anything_else");
    return makeResponse(session, text, "generic.anything_else", "home", true);
  }

  if (!session.task_type || !session.current_stage_id) {
    const classification = await classify(transcript, "intent");
    logEvent(session, "classify", { classification });

    if (classification.type === "valid_slot" && classification.extracted_slot) {
      return startTask(session, classification.extracted_slot as string, participantBalance, agents);
    }

    const text = resolvePrompt("home.welcome");
    return makeResponse(session, text, "home.welcome", "home", true);
  }

  const plan = getPlan(session.task_type)!;
  const stage = plan.stages.find((s) => s.stage_id === session.current_stage_id)!;

  const knownNames = stage.expected_input_type === "agent_name_or_tap"
    ? agents.map((a) => a.name)
    : recipients.map((r) => r.name);
  const stagePromptText = resolvePrompt(stage.primary_prompt_id, session.filled_slots);
  const classification = await classify(transcript, stage.expected_input_type, knownNames, stagePromptText);
  logEvent(session, "classify", {
    stage_id: stage.stage_id,
    transcript,
    classification,
  });

  if (
    classification.type === "valid_slot" &&
    stage.validation &&
    classification.slot_type === "amount"
  ) {
    const amount = classification.extracted_slot as number;
    if (stage.validation.min && amount < stage.validation.min) {
      const text = resolvePrompt(stage.validation.below_min_prompt_id!, session.filled_slots);
      return makeResponse(session, text, stage.validation.below_min_prompt_id!, stage.ui_config.screen as string);
    }
    if (stage.validation.max && amount > stage.validation.max) {
      const text = resolvePrompt(stage.validation.above_max_prompt_id!, session.filled_slots);
      return makeResponse(session, text, stage.validation.above_max_prompt_id!, stage.ui_config.screen as string);
    }
    if (amount > participantBalance) {
      const text = resolvePrompt(stage.validation.exceeds_balance_prompt_id!, {
        ...session.filled_slots,
        balance: participantBalance,
      });
      return makeResponse(session, text, stage.validation.exceeds_balance_prompt_id!, stage.ui_config.screen as string);
    }
  }

  if (
    classification.type === "valid_slot" &&
    classification.slot_type === "pin"
  ) {
    if (classification.extracted_slot !== participantPin) {
      classification.type = "denied";
    }
  }

  const branch = stage.branches[classification.type];
  if (!branch) {
    const fallback = stage.branches["unrecognized"];
    if (fallback) {
      return handleBranch(session, stage, fallback, classification, recipients, participantBalance);
    }
    const text = resolvePrompt("generic.not_understood");
    return makeResponse(session, text, "generic.not_understood", stage.ui_config.screen as string);
  }

  return handleBranch(session, stage, branch, classification, recipients, participantBalance);
}

function handleBranch(
  session: SessionContext,
  stage: PlanStage,
  branch: typeof stage.branches[string],
  classification: InputClassification,
  recipients: Recipient[],
  participantBalance: number,
): OrchestratorResponse {
  const plan = getPlan(session.task_type!)!;

  switch (branch.action) {
    case "fill_slot": {
      if (stage.slot_to_fill && classification.extracted_slot !== undefined) {
        session.filled_slots[stage.slot_to_fill] = classification.extracted_slot;
      }
      session.retry_count = 0;
      session.is_modality_switched = false;

      const nextStage = plan.stages.find((s) => s.stage_id === branch.next_stage)!;
      session.current_stage_id = nextStage.stage_id;
      logEvent(session, "stage_advance", { to: nextStage.stage_id });

      const text = resolvePrompt(nextStage.primary_prompt_id, session.filled_slots);
      return makeResponse(session, text, nextStage.primary_prompt_id, nextStage.ui_config.screen as string);
    }

    case "next_stage": {
      session.retry_count = 0;
      const nextStage = plan.stages.find((s) => s.stage_id === branch.next_stage)!;
      session.current_stage_id = nextStage.stage_id;
      logEvent(session, "stage_advance", { to: nextStage.stage_id });

      const text = resolvePrompt(nextStage.primary_prompt_id, session.filled_slots);
      return makeResponse(session, text, nextStage.primary_prompt_id, nextStage.ui_config.screen as string);
    }

    case "execute_transaction": {
      const amount = session.filled_slots["amount"] as number;
      const newBalance = participantBalance - amount;
      session.filled_slots["new_balance"] = newBalance;
      logEvent(session, "transaction_execute", {
        task_type: session.task_type,
        amount,
        new_balance: newBalance,
      });

      session.retry_count = 0;
      const nextStage = plan.stages.find((s) => s.stage_id === branch.next_stage)!;
      session.current_stage_id = nextStage.stage_id;

      const text = resolvePrompt(nextStage.primary_prompt_id, session.filled_slots);
      return makeResponse(session, text, nextStage.primary_prompt_id, nextStage.ui_config.screen as string, false, false, true);
    }

    case "retry": {
      session.retry_count++;
      logEvent(session, "retry", { count: session.retry_count });

      if (session.retry_count >= (branch.max_attempts ?? stage.branches["unrecognized"]?.max_attempts ?? 3)) {
        if (branch.final_failure_action === "abort_task" || branch.attempt_3_action === "modality_switch") {
          if (branch.attempt_3_action === "modality_switch") {
            session.is_modality_switched = true;
            const switchPromptId = branch.modality_switch_prompt_id ?? "generic.tap_icon_fallback";
            const text = resolvePrompt(switchPromptId);
            logEvent(session, "modality_switch", { stage_id: stage.stage_id });
            return makeResponse(session, text, switchPromptId, stage.ui_config.screen as string);
          }
          return abortTask(session);
        }
      }

      const promptId =
        session.retry_count === 2 && branch.attempt_2_prompt_id
          ? branch.attempt_2_prompt_id
          : branch.prompt_id ?? "generic.not_understood";

      const text = resolvePrompt(promptId, session.filled_slots);
      return makeResponse(session, text, promptId, stage.ui_config.screen as string);
    }

    case "replay_prompt": {
      const text = resolvePrompt(stage.primary_prompt_id, session.filled_slots);
      return makeResponse(session, text, stage.primary_prompt_id, stage.ui_config.screen as string);
    }

    case "abort_task": {
      return abortTask(session);
    }

    case "return_home": {
      const completedSlots = { ...session.filled_slots };
      const completedTaskType = session.task_type;
      logEvent(session, "task_complete", {
        task_type: completedTaskType,
        filled_slots: completedSlots,
      });
      resetTask(session);
      session.awaiting_post_transaction = true;
      session.filled_slots = completedSlots;
      const text = resolvePrompt("generic.anything_else");
      const response = makeResponse(session, text, "generic.anything_else", "home", true);
      session.filled_slots = {};
      return response;
    }

    default: {
      if (branch.clear_slot) {
        delete session.filled_slots[branch.clear_slot];
      }
      if (branch.next_stage) {
        session.retry_count = 0;
        const nextStage = plan.stages.find((s) => s.stage_id === branch.next_stage)!;
        session.current_stage_id = nextStage.stage_id;
        logEvent(session, "stage_advance", { to: nextStage.stage_id });
        const text = resolvePrompt(nextStage.primary_prompt_id, session.filled_slots);
        return makeResponse(session, text, nextStage.primary_prompt_id, nextStage.ui_config.screen as string);
      }
      const promptId = branch.prompt_id ?? stage.primary_prompt_id;
      const text = resolvePrompt(promptId, session.filled_slots);
      return makeResponse(session, text, promptId, stage.ui_config.screen as string);
    }
  }
}

function abortTask(session: SessionContext): OrchestratorResponse {
  logEvent(session, "task_abort", { task_type: session.task_type });
  resetTask(session);
  const text = resolvePrompt("generic.cancelled") + " " + resolvePrompt("home.welcome");
  return makeResponse(session, text, "generic.cancelled", "home", true, true);
}

export async function handleTapSelection(
  session: SessionContext,
  tapType: string,
  tapValue: string,
  recipients: Recipient[],
  participantPin: string,
  participantBalance: number,
  agents: Agent[] = [],
): Promise<OrchestratorResponse> {
  if (tapType === "nav" && tapValue === "home") {
    session.awaiting_post_transaction = false;
    logEvent(session, "nav_home", { from_task: session.task_type });
    resetTask(session);
    const text = resolvePrompt("home.welcome");
    return makeResponse(session, text, "home.welcome", "home", true);
  }

  if (tapType === "task_select") {
    session.awaiting_post_transaction = false;
    return startTask(session, tapValue, participantBalance, agents);
  }

  if (tapType === "auto_advance") {
    if (session.task_type && session.current_stage_id) {
      const plan = getPlan(session.task_type)!;
      const stage = plan.stages.find((s) => s.stage_id === session.current_stage_id)!;
      const branch = stage.branches["auto_advance"];
      if (branch) {
        const classification: InputClassification = {
          type: "valid_slot",
          raw_transcript: "",
          confidence: 1.0,
        };
        return handleBranch(session, stage, branch, classification, recipients, participantBalance);
      }
    }
    resetTask(session);
    const text = resolvePrompt("home.welcome");
    return makeResponse(session, text, "home.welcome", "home", true);
  }

  if (tapType === "operator_select") {
    return handleVoiceTurn(session, tapValue, recipients, participantPin, participantBalance, agents);
  }

  if (tapType === "onboarding" || tapType === "tutorial") {
    return handleVoiceTurn(session, tapValue, recipients, participantPin, participantBalance, agents);
  }

  return handleVoiceTurn(session, tapValue, recipients, participantPin, participantBalance, agents);
}

function makeResponse(
  session: SessionContext,
  promptText: string,
  promptId: string,
  screen: string,
  showMic = true,
  returnHome = false,
  taskComplete = false,
): OrchestratorResponse {
  return {
    prompt_text: promptText,
    prompt_id: promptId,
    ui_update: {
      screen,
      filled_slots: { ...session.filled_slots },
      show_mic: showMic && !session.is_modality_switched,
      is_modality_switched: session.is_modality_switched,
      task_complete: taskComplete,
      return_home: returnHome,
    },
    session,
  };
}
