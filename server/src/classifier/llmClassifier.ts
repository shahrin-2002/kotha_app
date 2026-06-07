import OpenAI from "openai";
import type { InputClassification } from "../core/types.js";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = "gpt-4.1-nano";

const SYSTEM = `You are a Bangladeshi Bengali voice classifier for a bKash-like MFS app.
Input: speech-to-text transcript from rural Bangladeshi women (may have STT errors/dialect).
Output: JSON only. No explanation.`;

export async function llmClassify(
  transcript: string,
  expectedType: string,
  context: { recipientNames?: string[]; agentNames?: string[]; promptText?: string },
): Promise<InputClassification | null> {
  if (!client) return null;

  const base = { raw_transcript: transcript };
  let userPrompt = "";

  if (expectedType === "intent") {
    userPrompt = `{"transcript":"${transcript}","classify_as":"intent","options":["send_money","cash_out","recharge","check_balance","cancel","help","repeat","unknown"]}`;
  } else if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = context.recipientNames ?? context.agentNames ?? [];
    userPrompt = `{"transcript":"${transcript}","question":"${context.promptText ?? ""}","classify_as":"name","available_names":[${names.map(n => `"${n}"`).join(",")}]}`;
  } else if (expectedType === "amount") {
    userPrompt = `{"transcript":"${transcript}","question":"${context.promptText ?? ""}","classify_as":"amount"}`;
  } else if (expectedType === "yes_no") {
    userPrompt = `{"transcript":"${transcript}","question":"${context.promptText ?? ""}","classify_as":"yes_no","options":["yes","no","cancel","change","unknown"]}`;
  } else {
    return null;
  }

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
      const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
      parsed = { result: cleaned };
    }

    const result = (parsed.intent ?? parsed.result ?? parsed.name ?? parsed.amount ?? parsed.response ?? raw).toString().toLowerCase().trim();

    if (result === "unknown" || !result) return null;

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
      const matched = names.find(n => n === result || n.toLowerCase() === result || n === (parsed.name ?? ""));
      if (matched) {
        return { ...base, type: "valid_slot", extracted_slot: matched, slot_type: "recipient_name", confidence: 0.9 };
      }
    }

    if (expectedType === "amount") {
      const numStr = (parsed.amount ?? result).toString().replace(/[^\d]/g, "");
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > 0) {
        return { ...base, type: "valid_slot", extracted_slot: num, slot_type: "amount", confidence: 0.9 };
      }
    }

    if (expectedType === "yes_no") {
      const r = parsed.response ?? parsed.result ?? result;
      if (r === "yes") return { ...base, type: "confirmed", confidence: 0.9 };
      if (r === "no") return { ...base, type: "denied", confidence: 0.9 };
      if (r === "cancel") return { ...base, type: "cancelled", confidence: 0.9 };
      if (r === "change") return { ...base, type: "change_request", confidence: 0.9 };
    }

    return null;
  } catch (err: any) {
    console.error("[LLM classify error]", err.message);
    return null;
  }
}
