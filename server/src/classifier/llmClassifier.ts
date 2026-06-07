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

  const DIALECT_CONTEXT = `IMPORTANT: The user speaks Bangladeshi Bengali (বাংলাদেশি বাংলা), NOT Indian/Kolkata Bengali.
Common dialect features: "হ্যাঁ"/"হ্যা"/"আ" for yes, "না"/"নাহ"/"নাই" for no, "পাঠামু"/"পাঠাইতাম" instead of "পাঠাবো",
"কত টেকা"/"কত ট্যাকা" for "কত টাকা", "পাঁচশ" for 500, "হাজার" = 1000, "ড্যাশ আউট"/"ক্যাশআউট" for cash out.
The audio comes from Whisper STT which may produce slight transcription errors. Be lenient with spelling variations.`;

  if (expectedType === "intent") {
    systemPrompt = `${DIALECT_CONTEXT}
You classify Bangla MFS (mobile financial service like bKash) voice commands.
Tasks: send_money, cash_out, recharge, check_balance.
Examples:
- send_money: "টাকা পাঠাবো", "টাকা পাঠামু", "পাঠান", "সেন্ড করবো", "টাকা দিবো", "টাকা দিতে চাই", "পাঠাইতে চাই"
- cash_out: "ক্যাশ আউট", "ড্যাশ আউট", "ক্যাশআউট", "টাকা তুলবো", "তুলতে চাই", "টাকা তুলুম"
- recharge: "রিচার্জ", "রিচার্জ করবো", "ফ্লেক্সি লোড", "মোবাইল রিচার্জ"
- check_balance: "ব্যালেন্স", "ব্যালান্স", "কত আছে", "কত টাকা আছে", "হিসাব দেখবো", "জমা কত"
Also: cancel (বাতিল/থামো), help (সাহায্য/কী করতে হবে), repeat (আবার বলো).
Respond with ONLY one of: send_money, cash_out, recharge, check_balance, cancel, help, repeat, unknown`;
  } else if (expectedType === "recipient_name_or_tap" || expectedType === "agent_name_or_tap") {
    const names = context.recipientNames ?? context.agentNames ?? [];
    systemPrompt = `${DIALECT_CONTEXT}
You extract a person's name from Bangladeshi Bangla speech. Available names: ${names.join(", ")}.
The user may say: "করিমকে পাঠাবো", "রহিমারে দাও", "জামাল ভাইরে", "করিম ভাই", "রহিমা আপু".
Handle suffixes: কে, রে, র, তে, ভাই, আপু, দের, ের. Also handle Whisper misspellings.
Respond with ONLY the matched name from the list, or "unknown" if no match.`;
  } else if (expectedType === "amount") {
    systemPrompt = `${DIALECT_CONTEXT}
You extract a monetary amount from Bangladeshi Bangla speech for bKash transactions.
Examples: "পাঁচশো টাকা"=500, "একশো"=100, "দুই হাজার"=2000, "এক হাজার"=1000, "হাজার টাকা"=1000,
"পাঁচশ"=500, "১ হাজার"=1000, "তিনশো"=300, "দশ হাজার"=10000, "পঞ্চাশ"=50.
Bare "হাজার" without number = 1000. "পাচশো"/"পাঁচশ"/"পাচশ" all = 500.
Respond with ONLY the number (digits), or "unknown" if you can't extract an amount.`;
  } else if (expectedType === "yes_no") {
    systemPrompt = `${DIALECT_CONTEXT}
You classify Bangladeshi Bangla yes/no responses in an MFS app context.
Yes: হ্যাঁ, হ্যা, হা, আ, জি, জ্বি, ঠিক, ঠিক আছে, হয়, করো, হ্যাঁ করো, ok, yes, হ, যা
No: না, নাহ, নাই, চাই না, দরকার নেই, no, না না
Cancel: বাতিল, থামো, বন্ধ
Change: বদলাও, পাল্টাও, ঠিক না
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
