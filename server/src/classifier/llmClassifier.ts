import OpenAI from "openai";
import type { InputClassification } from "../core/types.js";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = "gpt-4.1-mini";

interface ClassifyContext {
  recipientNames?: string[];
  agentNames?: string[];
  promptText?: string;
  screen?: string;
}

function buildPrompt(transcript: string, expectedType: string, ctx: ClassifyContext): string | null {
  const screen = ctx.screen ?? "";
  const q = ctx.promptText ?? "";

  switch (screen) {
    case "home":
      return `Bangladeshi Bengali MFS app. User on home screen choosing a service.
Transcript: "${transcript}"
Reply ONLY one of: send_money, cash_out, recharge, check_balance, cancel, help, unknown`;

    case "select_recipient": {
      const names = ctx.recipientNames ?? [];
      return `User choosing a person to send money to.
Names: ${names.join(", ")}
Transcript: "${transcript}"
Reply ONLY the matched name, or unknown`;
    }

    case "select_agent": {
      const names = ctx.agentNames ?? [];
      return `User choosing a cash-out agent.
Names: ${names.join(", ")}
Transcript: "${transcript}"
Reply ONLY the matched name, or unknown`;
    }

    case "enter_amount":
      return `User saying a money amount in Bangla.
App asked: "${q}"
Transcript: "${transcript}"
Reply ONLY the number in digits, or unknown`;

    case "confirm":
      return `User confirming or rejecting a money transaction.
App asked: "${q}"
Transcript: "${transcript}"
yes = any agreement/confirmation like হ্যাঁ, পাঠাও, দাও, করো, পাঠায় দেন, ঠিক আছে, ok
no = any rejection like না, নাহ, চাই না
cancel = বাতিল, থামো
change = wants to change amount or recipient
Reply ONLY one of: yes, no, cancel, change, unknown`;

    case "select_operator":
      return `User choosing mobile operator.
Options: গ্রামীণফোন, রবি, বাংলালিংক, টেলিটক
Transcript: "${transcript}"
Reply ONLY the operator name, or unknown`;

    case "pin_pad":
    case "enter_number":
    case "result":
    case "balance":
      return null;

    default:
      break;
  }

  if (expectedType === "intent") {
    return `Bangladeshi Bengali MFS voice command.
Transcript: "${transcript}"
Reply ONLY one of: send_money, cash_out, recharge, check_balance, cancel, help, repeat, unknown`;
  }
  if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = ctx.recipientNames ?? ctx.agentNames ?? [];
    return `User saying a name. Names: ${names.join(", ")}
Transcript: "${transcript}"
Reply ONLY the matched name, or unknown`;
  }
  if (expectedType === "amount") {
    return `User saying money amount in Bangla.
Transcript: "${transcript}"
Reply ONLY the number in digits, or unknown`;
  }
  if (expectedType === "yes_no") {
    return `User responding yes or no.
App asked: "${q}"
Transcript: "${transcript}"
Reply ONLY one of: yes, no, cancel, change, unknown`;
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
    const start = Date.now();
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Bangladeshi Bengali voice classifier. Reply with ONLY the answer word. No JSON. No explanation." },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 15,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "unknown";
    const result = raw.toLowerCase().replace(/["""।.]/g, "").trim();
    const ms = Date.now() - start;
    console.log(`[LLM] screen=${context.screen} type=${expectedType} | "${transcript}" → "${result}" (${ms}ms)`);

    if (result === "unknown" || !result) return null;

    // Intent
    if (expectedType === "intent" || context.screen === "home") {
      if (result === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (result === "help") return { ...base, type: "help_request", confidence: 0.9 };
      if (result === "repeat") return { ...base, type: "repeat_request", confidence: 0.9 };
      if (["send_money", "cash_out", "recharge", "check_balance"].includes(result)) {
        return { ...base, type: "valid_slot", extracted_slot: result, slot_type: "intent", confidence: 0.9 };
      }
    }

    // Name
    if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
      const names = context.recipientNames ?? context.agentNames ?? [];
      const matched = names.find(n => n === raw.trim() || n.toLowerCase() === result);
      if (matched) {
        return { ...base, type: "valid_slot", extracted_slot: matched, slot_type: "recipient_name", confidence: 0.9 };
      }
    }

    // Amount
    if (expectedType === "amount") {
      const numStr = result.replace(/[^\d]/g, "");
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > 0) {
        return { ...base, type: "valid_slot", extracted_slot: num, slot_type: "amount", confidence: 0.9 };
      }
    }

    // Yes/No
    if (expectedType === "yes_no") {
      if (result === "yes") return { ...base, type: "confirmed", confidence: 0.9 };
      if (result === "no") return { ...base, type: "denied", confidence: 0.9 };
      if (result === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (result === "change") return { ...base, type: "change_request", confidence: 0.9 };
    }

    // Operator
    if (expectedType === "operator_name_or_tap" || context.screen === "select_operator") {
      if (result && result !== "unknown") {
        return { ...base, type: "valid_slot", extracted_slot: raw.trim(), slot_type: "operator", confidence: 0.9 };
      }
    }

    return null;
  } catch (err: any) {
    console.error("[LLM classify error]", err.message);
    return null;
  }
}
