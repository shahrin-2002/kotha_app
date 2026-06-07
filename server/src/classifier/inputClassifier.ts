import type { ClassificationType, InputClassification } from "../core/types.js";
import { parseBanglaNumber } from "../bangla/numberParser.js";
import { fuzzyMatchRecipient } from "../bangla/fuzzyMatch.js";
import { llmClassify } from "./llmClassifier.js";

const YES_WORDS = ["হ্যাঁ", "হ্যা", "হা", "আ", "হ", "জি", "জ্বি", "ঠিক", "ঠিক আছে", "আছে", "হয়", "করো", "করুন", "পাঠাও", "পাঠান", "হ্যাঁ হ্যাঁ", "ওকে", "যা", "হ্যাঁ করো", "কর", "হুম", "হুঁ"];
const NO_WORDS = ["না", "নাহ", "না না", "নাই", "চাই না", "দরকার নেই", "লাগবে না", "করবো না", "করব না"];
const CANCEL_WORDS = ["বাতিল", "থামো", "থামুন", "ফিরে যাও", "ফিরে যান", "বন্ধ", "শেষ", "যাই", "বাদ দাও", "বাদ দিন"];
const HELP_WORDS = ["কী করতে হবে", "কি করতে হবে", "সাহায্য", "বুঝি নাই", "বুঝিনি", "কিভাবে", "কীভাবে", "শেখাও", "শেখান"];
const REPEAT_WORDS = ["আবার বলো", "আবার বলুন", "আবার", "কী বললে", "কি বললে", "বুঝিনি আবার বলো"];
const CHANGE_WORDS = ["বদলাও", "বদলান", "পাল্টাও", "পাল্টান", "নাম বদলাও", "টাকা বদলাও", "ফিরে যাই"];

const INTENT_KEYWORDS: Record<string, string> = {
  "টাকা পাঠা": "send_money",
  "পাঠাব": "send_money",
  "পাঠাবো": "send_money",
  "পাঠাবু": "send_money",
  "পাঠাই": "send_money",
  "পাঠাতে": "send_money",
  "পাঠানো": "send_money",
  "পাঠান": "send_money",
  "পাঠাও": "send_money",
  "সেন্ড": "send_money",
  "সেন্ড মানি": "send_money",
  "টাকা দিতে": "send_money",
  "টাকা দিব": "send_money",
  "টাকা দিবো": "send_money",
  "টাকা দেব": "send_money",
  "send": "send_money",
  "ক্যাশ আউট": "cash_out",
  "ক্যাশআউট": "cash_out",
  "ড্যাশ আউট": "cash_out",
  "ক্যাশ": "cash_out",
  "টাকা তুল": "cash_out",
  "তুলব": "cash_out",
  "তুলবো": "cash_out",
  "তুলতে": "cash_out",
  "তোলা": "cash_out",
  "তুলুম": "cash_out",
  "উইথড্র": "cash_out",
  "cash": "cash_out",
  "রিচার্জ": "recharge",
  "মোবাইল রিচার্জ": "recharge",
  "ফ্লেক্সি": "recharge",
  "recharge": "recharge",
  "ব্যালেন্স": "check_balance",
  "ব্যালান্স": "check_balance",
  "ব্যাল": "check_balance",
  "জমা কত": "check_balance",
  "কত আছে": "check_balance",
  "কত টাকা আছে": "check_balance",
  "টাকা কত": "check_balance",
  "হিসাব": "check_balance",
  "balance": "check_balance",
};

const OPERATOR_MAP: Record<string, string> = {
  "grameenphone": "গ্রামীণফোন",
  "robi": "রবি",
  "banglalink": "বাংলালিংক",
  "teletalk": "টেলিটক",
};

const OPERATOR_KEYWORDS: Record<string, string> = {
  "গ্রামীণফোন": "গ্রামীণফোন",
  "গ্রামীণ": "গ্রামীণফোন",
  "জিপি": "গ্রামীণফোন",
  "রবি": "রবি",
  "বাংলালিংক": "বাংলালিংক",
  "বিএল": "বাংলালিংক",
  "টেলিটক": "টেলিটক",
};

function matchesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase().trim();
  return words.some((w) => lower.includes(w));
}

export async function classify(
  transcript: string,
  expectedType: string,
  recipientNames: string[] = [],
): Promise<InputClassification> {
  const text = transcript.trim();
  const base: Omit<InputClassification, "type" | "confidence"> = {
    raw_transcript: text,
  };

  if (!text || text.length === 0) {
    return { ...base, type: "silent", confidence: 1.0 };
  }

  if (matchesAny(text, CANCEL_WORDS)) {
    return { ...base, type: "cancelled", confidence: 0.9 };
  }
  if (matchesAny(text, REPEAT_WORDS)) {
    return { ...base, type: "repeat_request", confidence: 0.9 };
  }
  if (matchesAny(text, HELP_WORDS)) {
    return { ...base, type: "help_request", confidence: 0.85 };
  }

  let result: InputClassification;

  switch (expectedType) {
    case "intent":
      result = classifyIntent(text, base);
      break;

    case "recipient_name_or_tap":
      result = classifyRecipient(text, recipientNames, base);
      break;

    case "amount":
      result = classifyAmount(text, base);
      break;

    case "yes_no":
      result = classifyYesNo(text, base);
      break;

    case "pin":
      return classifyPin(text, base);

    case "agent_name_or_tap":
      result = classifyRecipient(text, recipientNames, base);
      break;

    case "operator_name_or_tap":
      result = classifyOperator(text, base);
      break;

    case "phone_number":
      result = classifyPhoneNumber(text, base);
      break;

    case "tap":
      return { ...base, type: "valid_slot", extracted_slot: text, slot_type: "tap", confidence: 0.9 };

    case "name":
      if (text.length > 0) {
        return { ...base, type: "valid_slot", extracted_slot: text, slot_type: "name", confidence: 0.8 };
      }
      return { ...base, type: "unrecognized", confidence: 0.5 };

    default:
      result = { ...base, type: "unrecognized", confidence: 0.3 };
  }

  // LLM fallback when rules can't classify
  if (result.type === "unrecognized") {
    const llmResult = await llmClassify(text, expectedType, { recipientNames });
    if (llmResult) return llmResult;
  }

  return result;
}

function classifyIntent(
  text: string,
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  for (const [keyword, intent] of Object.entries(INTENT_KEYWORDS)) {
    if (text.includes(keyword)) {
      return {
        ...base,
        type: "valid_slot",
        extracted_slot: intent,
        slot_type: "intent",
        confidence: 0.85,
      };
    }
  }
  return { ...base, type: "unrecognized", confidence: 0.4 };
}

function classifyRecipient(
  text: string,
  recipientNames: string[],
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  if (recipientNames.length === 0) {
    return { ...base, type: "unrecognized", confidence: 0.3 };
  }

  const result = fuzzyMatchRecipient(text, recipientNames);

  if (result.is_ambiguous) {
    return {
      ...base,
      type: "ambiguous",
      ambiguous_matches: result.all_matches.map((m) => m.name),
      confidence: 0.6,
    };
  }

  if (result.matched && result.best_match) {
    return {
      ...base,
      type: "valid_slot",
      extracted_slot: result.best_match,
      slot_type: "recipient_name",
      confidence: result.all_matches[0].distance === 0 ? 0.95 : 0.75,
    };
  }

  return { ...base, type: "unrecognized", confidence: 0.4 };
}

function classifyAmount(
  text: string,
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  const amount = parseBanglaNumber(text);
  if (amount !== null && amount > 0) {
    return {
      ...base,
      type: "valid_slot",
      extracted_slot: amount,
      slot_type: "amount",
      confidence: 0.9,
    };
  }
  return { ...base, type: "unrecognized", confidence: 0.4 };
}

function classifyYesNo(
  text: string,
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  if (matchesAny(text, YES_WORDS)) {
    return { ...base, type: "confirmed", confidence: 0.9 };
  }
  if (matchesAny(text, NO_WORDS)) {
    return { ...base, type: "denied", confidence: 0.9 };
  }
  if (matchesAny(text, CHANGE_WORDS)) {
    return { ...base, type: "change_request", confidence: 0.85 };
  }
  return { ...base, type: "unrecognized", confidence: 0.4 };
}

function classifyPin(
  text: string,
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 4) {
    return {
      ...base,
      type: "valid_slot",
      extracted_slot: digits,
      slot_type: "pin",
      confidence: 0.95,
    };
  }
  return { ...base, type: "unrecognized", confidence: 0.4 };
}

function classifyOperator(
  text: string,
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  if (OPERATOR_MAP[text]) {
    return {
      ...base,
      type: "valid_slot",
      extracted_slot: OPERATOR_MAP[text],
      slot_type: "operator",
      confidence: 0.95,
    };
  }
  for (const [keyword, banglaName] of Object.entries(OPERATOR_KEYWORDS)) {
    if (text.includes(keyword)) {
      return {
        ...base,
        type: "valid_slot",
        extracted_slot: banglaName,
        slot_type: "operator",
        confidence: 0.9,
      };
    }
  }
  return { ...base, type: "unrecognized", confidence: 0.4 };
}

function classifyPhoneNumber(
  text: string,
  base: Omit<InputClassification, "type" | "confidence">
): InputClassification {
  const digits = text.replace(/[^\d০-৯]/g, "").replace(/[০-৯]/g, (d) => {
    const BANGLA_TO_ASCII: Record<string, string> = {
      "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
      "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
    };
    return BANGLA_TO_ASCII[d] ?? d;
  });
  if (digits.length === 11 && digits.startsWith("01")) {
    return {
      ...base,
      type: "valid_slot",
      extracted_slot: digits,
      slot_type: "phone_number",
      confidence: 0.95,
    };
  }
  if (digits.length > 0 && digits.length < 11) {
    return { ...base, type: "unrecognized", confidence: 0.5 };
  }
  return { ...base, type: "unrecognized", confidence: 0.4 };
}
