import OpenAI from "openai";
import type { InputClassification } from "../core/types.js";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = "gpt-4.1-nano";

const SYSTEM = `You are a Bangladeshi Bengali voice classifier for a bKash-like MFS app.
Input: JSON with transcript and screen context.
Output: JSON only. No explanation. No markdown.`;

interface ClassifyContext {
  recipientNames?: string[];
  agentNames?: string[];
  promptText?: string;
  screen?: string;
}

function buildPrompt(transcript: string, expectedType: string, ctx: ClassifyContext): string | null {
  const screen = ctx.screen ?? "";
  const q = ctx.promptText ?? "";
  const t = transcript;

  // Screen-specific prompts — we know exactly what the user might say on each screen
  switch (screen) {
    case "home":
      return JSON.stringify({
        transcript: t,
        screen: "home",
        context: "User is on the bKash home screen. They choose a service.",
        classify: "intent",
        options: ["send_money", "cash_out", "recharge", "check_balance", "cancel", "help", "unknown"],
      });

    case "select_recipient": {
      const names = ctx.recipientNames ?? [];
      return JSON.stringify({
        transcript: t,
        screen: "select_recipient",
        context: "User is choosing who to send money to.",
        question: q,
        classify: "name",
        available_names: names,
        note: "Ignore Bangla suffixes like কে, রে, ভাই, আপু. Return exact name from list.",
      });
    }

    case "select_agent": {
      const names = ctx.agentNames ?? [];
      return JSON.stringify({
        transcript: t,
        screen: "select_agent",
        context: "User is choosing a cash-out agent.",
        question: q,
        classify: "name",
        available_names: names,
      });
    }

    case "enter_amount":
      return JSON.stringify({
        transcript: t,
        screen: "enter_amount",
        context: "User is saying how much money (Bangla number). Could be words like হাজার, পাঁচশো, একশো or digits.",
        question: q,
        classify: "amount",
        note: "Return numeric digits only. হাজার alone = 1000.",
      });

    case "confirm":
      return JSON.stringify({
        transcript: t,
        screen: "confirm",
        context: "User is confirming or rejecting a transaction.",
        question: q,
        classify: "yes_no",
        options: ["yes", "no", "cancel", "change", "unknown"],
      });

    case "pin_pad":
      return null; // PIN is deterministic, no LLM needed

    case "result":
    case "balance":
      return null; // Auto-advance screens, no classification needed

    case "select_operator":
      return JSON.stringify({
        transcript: t,
        screen: "select_operator",
        context: "User is choosing a mobile operator for recharge.",
        classify: "operator",
        options: ["গ্রামীণফোন", "রবি", "বাংলালিংক", "টেলিটক", "unknown"],
      });

    case "enter_number":
      return null; // Phone number is deterministic

    default:
      break;
  }

  // Fallback: generic classification by expectedType
  if (expectedType === "intent") {
    return JSON.stringify({
      transcript: t, classify: "intent",
      options: ["send_money", "cash_out", "recharge", "check_balance", "cancel", "help", "repeat", "unknown"],
    });
  }
  if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = ctx.recipientNames ?? ctx.agentNames ?? [];
    return JSON.stringify({ transcript: t, question: q, classify: "name", available_names: names });
  }
  if (expectedType === "amount") {
    return JSON.stringify({ transcript: t, question: q, classify: "amount" });
  }
  if (expectedType === "yes_no") {
    return JSON.stringify({ transcript: t, question: q, classify: "yes_no", options: ["yes", "no", "cancel", "change", "unknown"] });
  }

  return null;
}

export async function llmClassify(
  transcript: string,
  expectedType: string,
  context: ClassifyContext,
): Promise<InputClassification | null> {
  if (!client) return null;

  const base = { raw_transcript: transcript };
  const userPrompt = buildPrompt(transcript, expectedType, context);
  if (!userPrompt) return null;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 30,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    console.log(`[LLM classify] "${transcript}" → ${raw}`);

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.toLowerCase().replace(/[^a-z0-9_ঀ-৿]/g, "");
      parsed = { result: cleaned };
    }

    const result = (parsed.intent ?? parsed.result ?? parsed.name ?? parsed.amount ?? parsed.response ?? parsed.operator ?? raw).toString().trim();
    const resultLower = result.toLowerCase();

    if (resultLower === "unknown" || !result) return null;

    // Intent
    if (expectedType === "intent" || (context.screen === "home" && !expectedType)) {
      if (resultLower === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (resultLower === "help") return { ...base, type: "help_request", confidence: 0.9 };
      if (resultLower === "repeat") return { ...base, type: "repeat_request", confidence: 0.9 };
      if (["send_money", "cash_out", "recharge", "check_balance"].includes(resultLower)) {
        return { ...base, type: "valid_slot", extracted_slot: resultLower, slot_type: "intent", confidence: 0.9 };
      }
    }

    // Name
    if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
      const names = context.recipientNames ?? context.agentNames ?? [];
      const matched = names.find(n => n === result || n.toLowerCase() === resultLower || n === (parsed.name ?? ""));
      if (matched) {
        return { ...base, type: "valid_slot", extracted_slot: matched, slot_type: "recipient_name", confidence: 0.9 };
      }
    }

    // Amount
    if (expectedType === "amount") {
      const numStr = (parsed.amount ?? result).toString().replace(/[^\d]/g, "");
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > 0) {
        return { ...base, type: "valid_slot", extracted_slot: num, slot_type: "amount", confidence: 0.9 };
      }
    }

    // Yes/No
    if (expectedType === "yes_no") {
      const r = (parsed.response ?? parsed.result ?? resultLower).toString().toLowerCase();
      if (r === "yes") return { ...base, type: "confirmed", confidence: 0.9 };
      if (r === "no") return { ...base, type: "denied", confidence: 0.9 };
      if (r === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (r === "change") return { ...base, type: "change_request", confidence: 0.9 };
    }

    // Operator
    if (expectedType === "operator_name_or_tap") {
      const op = parsed.operator ?? result;
      if (op && op !== "unknown") {
        return { ...base, type: "valid_slot", extracted_slot: op, slot_type: "operator", confidence: 0.9 };
      }
    }

    return null;
  } catch (err: any) {
    console.error("[LLM classify error]", err.message);
    return null;
  }
}
