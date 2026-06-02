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

  if (expectedType === "intent") {
    systemPrompt = `You classify Bangla MFS voice commands. The user wants to do one of: send_money, cash_out, recharge, check_balance.
They may say things like "টাকা পাঠাবো", "ক্যাশ আউট করবো", "রিচার্জ করবো", "ব্যালেন্স দেখবো" or similar.
They might also say: cancel (বাতিল/থামো), help (সাহায্য/কী করতে হবে), or repeat (আবার বলো).
Respond with ONLY one of: send_money, cash_out, recharge, check_balance, cancel, help, repeat, unknown`;
  } else if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = context.recipientNames ?? context.agentNames ?? [];
    systemPrompt = `You extract a person's name from Bangla speech. Available names: ${names.join(", ")}.
The user may say things like "করিমকে পাঠাবো" (send to Korim), "রহিমা" (Rohima), "জামাল ভাই" (Jamal bhai).
Extract the matching name from the available list. Handle suffixes like কে, র, তে, ভাই, আপু.
Respond with ONLY the matched name from the list, or "unknown" if no match.`;
  } else if (expectedType === "amount") {
    systemPrompt = `You extract a monetary amount from Bangla speech. The user says an amount in Bangla like "পাঁচশো টাকা" (500), "একশো" (100), "দুই হাজার" (2000).
They might also say numbers in English mixed with Bangla. Extract the numeric value.
Respond with ONLY the number (digits), or "unknown" if you can't extract an amount.`;
  } else if (expectedType === "yes_no") {
    systemPrompt = `You classify Bangla yes/no responses.
Yes: হ্যাঁ, জি, ঠিক আছে, হয়, করো, ok, yes
No: না, নাহ, চাই না, no
Cancel: বাতিল, থামো
Change: বদলাও, পাল্টাও
Respond with ONLY one of: yes, no, cancel, change, unknown`;
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
