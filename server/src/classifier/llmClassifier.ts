import OpenAI from "openai";
import type { InputClassification } from "../core/types.js";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function llmClassify(
  transcript: string,
  expectedType: string,
  context: { recipientNames?: string[]; agentNames?: string[] },
): Promise<InputClassification | null> {
  if (!client) return null;

  const base = { raw_transcript: transcript };

  let systemPrompt = "";

  const CONTEXT = `The user speaks Bangladeshi Bengali and is using a bKash-like mobile financial service app. The text comes from speech recognition and may have minor transcription errors. Use your understanding of Bangla to interpret what the user meant.`;

  if (expectedType === "intent") {
    systemPrompt = `${CONTEXT}
Classify what the user wants to do. Options: send_money, cash_out, recharge, check_balance, cancel, help, repeat, unknown.
Respond with ONLY one word from the options above.`;
  } else if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = context.recipientNames ?? context.agentNames ?? [];
    systemPrompt = `${CONTEXT}
The user is saying a person's name. Available names: ${names.join(", ")}.
Extract which name they mean, ignoring Bangla grammatical suffixes or honorifics.
Respond with ONLY the matched name from the list, or "unknown".`;
  } else if (expectedType === "amount") {
    systemPrompt = `${CONTEXT}
The user is saying a monetary amount in Bangla. Extract the numeric value in digits.
Respond with ONLY the number, or "unknown".`;
  } else if (expectedType === "yes_no") {
    systemPrompt = `${CONTEXT}
The user is responding yes or no to a confirmation question.
Respond with ONLY one of: yes, no, cancel, change, unknown.`;
  } else {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const result = response.choices[0]?.message?.content?.trim() ?? "unknown";
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
      const matched = names.find(n => n === result);
      if (matched) {
        return { ...base, type: "valid_slot", extracted_slot: matched, slot_type: "recipient_name", confidence: 0.9 };
      }
    }

    if (expectedType === "amount") {
      const num = parseInt(result, 10);
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
