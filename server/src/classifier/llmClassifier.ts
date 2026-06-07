import OpenAI from "openai";
import type { InputClassification } from "../core/types.js";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function llmClassify(
  transcript: string,
  expectedType: string,
  context: { recipientNames?: string[]; agentNames?: string[]; promptText?: string },
): Promise<InputClassification | null> {
  if (!client) return null;

  const base = { raw_transcript: transcript };

  const SYSTEM = `You are the brain of a Bangladeshi bKash-like mobile financial service app.
You process voice input from rural Bangladeshi women who speak Bangladeshi Bengali (বাংলাদেশি বাংলা).
The text comes from Whisper speech recognition and may have transcription errors or dialect variations.
Use your full understanding of Bangla language, dialects, and context to interpret what the user meant.`;

  let taskPrompt = "";

  if (expectedType === "intent") {
    taskPrompt = `The app asked the user what they want to do.
The user's voice was transcribed as: "${transcript}"

Classify their intent. Options:
- send_money (sending money to someone)
- cash_out (withdrawing cash from an agent)
- recharge (mobile phone recharge/top-up)
- check_balance (checking account balance)
- cancel (wants to stop/go back)
- help (asking for help)
- repeat (wants to hear the prompt again)
- unknown (can't determine intent)

Respond with ONLY one option.`;
  } else if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = context.recipientNames ?? context.agentNames ?? [];
    taskPrompt = `The app asked: "${context.promptText ?? "কাকে পাঠাবেন?"}"
Available names: ${names.join(", ")}
The user's voice was transcribed as: "${transcript}"

Which name from the list is the user referring to? Ignore Bangla suffixes (কে, রে, র, ভাই, আপু, etc.).
Respond with ONLY the exact name from the list, or "unknown".`;
  } else if (expectedType === "amount") {
    taskPrompt = `The app asked: "${context.promptText ?? "কত টাকা?"}"
The user's voice was transcribed as: "${transcript}"

Extract the monetary amount as a number.
Respond with ONLY the number in digits (e.g., 500, 1000, 2000), or "unknown".`;
  } else if (expectedType === "yes_no") {
    taskPrompt = `The app asked: "${context.promptText ?? "ঠিক আছে?"}"
The user's voice was transcribed as: "${transcript}"

What is the user's response?
- yes (confirming/agreeing)
- no (declining/disagreeing)
- cancel (wants to cancel the whole task)
- change (wants to change something like amount or recipient)
- unknown

Respond with ONLY one option.`;
  } else {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: taskPrompt },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase() ?? "unknown";
    console.log(`[LLM classify] "${transcript}" → ${result}`);

    if (result === "unknown") return null;

    if (expectedType === "intent") {
      if (result === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (result === "help") return { ...base, type: "help_request", confidence: 0.9 };
      if (result === "repeat") return { ...base, type: "repeat_request", confidence: 0.9 };
      if (["send_money", "cash_out", "recharge", "check_balance"].includes(result)) {
        return { ...base, type: "valid_slot", extracted_slot: result, slot_type: "intent", confidence: 0.9 };
      }
    }

    if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
      const names = context.recipientNames ?? context.agentNames ?? [];
      const matched = names.find(n => n === result || n.toLowerCase() === result);
      if (matched) {
        return { ...base, type: "valid_slot", extracted_slot: matched, slot_type: "recipient_name", confidence: 0.9 };
      }
    }

    if (expectedType === "amount") {
      const cleaned = result.replace(/[^\d]/g, "");
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num > 0) {
        return { ...base, type: "valid_slot", extracted_slot: num, slot_type: "amount", confidence: 0.9 };
      }
    }

    if (expectedType === "yes_no") {
      if (result === "yes") return { ...base, type: "confirmed", confidence: 0.9 };
      if (result === "no") return { ...base, type: "denied", confidence: 0.9 };
      if (result === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (result === "change") return { ...base, type: "change_request", confidence: 0.9 };
    }

    return null;
  } catch (err: any) {
    console.error("[LLM classify error]", err.message);
    return null;
  }
}
