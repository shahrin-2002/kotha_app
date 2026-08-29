const BANGLA_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

const BANGLA_WORDS: Record<string, number> = {
  "শূন্য": 0,
  "এক": 1, "একটা": 1, "একটি": 1,
  "দুই": 2, "দুইটা": 2, "দুইটি": 2,
  "তিন": 3, "তিনটা": 3, "তিনটি": 3,
  "চার": 4, "পাঁচ": 5, "ছয়": 6, "সাত": 7, "আট": 8, "নয়": 9,
  "দশ": 10, "এগারো": 11, "বারো": 12, "তেরো": 13, "চৌদ্দ": 14,
  "পনেরো": 15, "ষোলো": 16, "সতেরো": 17, "আঠারো": 18, "উনিশ": 19,
  "বিশ": 20, "একুশ": 21, "বাইশ": 22, "তেইশ": 23, "চব্বিশ": 24,
  "পঁচিশ": 25, "ছাব্বিশ": 26, "সাতাশ": 27, "আঠাশ": 28, "উনত্রিশ": 29,
  "ত্রিশ": 30, "একত্রিশ": 31, "বত্রিশ": 32, "তেত্রিশ": 33, "চৌত্রিশ": 34,
  "পঁয়ত্রিশ": 35, "ছত্রিশ": 36, "সাতত্রিশ": 37, "আটত্রিশ": 38, "উনচল্লিশ": 39,
  "চল্লিশ": 40, "একচল্লিশ": 41, "বিয়াল্লিশ": 42, "তেতাল্লিশ": 43, "চুয়াল্লিশ": 44,
  "পঁয়তাল্লিশ": 45, "ছেচল্লিশ": 46, "সাতচল্লিশ": 47, "আটচল্লিশ": 48, "উনপঞ্চাশ": 49,
  "পঞ্চাশ": 50, "পচাশ": 50,
  "ষাট": 60, "সত্তর": 70, "আশি": 80, "নব্বই": 90,

  "একশ": 100, "একশো": 100, "একশত": 100,
  "দুইশ": 200, "দুইশো": 200, "দুশো": 200, "দুশত": 200,
  "তিনশ": 300, "তিনশো": 300, "তিনশত": 300,
  "চারশ": 400, "চারশো": 400,
  "পাঁচশ": 500, "পাঁচশো": 500, "পাঁচশত": 500,
  "ছয়শ": 600, "ছয়শো": 600,
  "সাতশ": 700, "সাতশো": 700,
  "আটশ": 800, "আটশো": 800,
  "নয়শ": 900, "নয়শো": 900,
};

const MULTIPLIER_WORDS: Record<string, number> = {
  "শ": 100, "শো": 100, "শত": 100,
  "হাজার": 1000,
  "লাখ": 100000,
};

function banglaDigitsToAscii(text: string): string {
  return text.replace(/[০-৯]/g, (ch) => BANGLA_DIGITS[ch] ?? ch);
}

export function parseBanglaNumber(text: string): number | null {
  const cleaned = text.trim().replace(/টাকা/g, "").trim();

  const asciiVersion = banglaDigitsToAscii(cleaned);
  const directNum = parseInt(asciiVersion, 10);
  if (!isNaN(directNum) && directNum > 0) {
    return directNum;
  }

  const directMatch = BANGLA_WORDS[cleaned];
  if (directMatch !== undefined) return directMatch;

  const tokens = cleaned.split(/\s+/);
  let total = 0;
  let current = 0;

  for (const token of tokens) {
    const wordVal = BANGLA_WORDS[token];
    if (wordVal !== undefined) {
      if (wordVal >= 100) {
        current += wordVal;
      } else {
        current += wordVal;
      }
      continue;
    }

    const mult = MULTIPLIER_WORDS[token];
    if (mult !== undefined) {
      if (current === 0) current = 1;
      if (mult === 1000 || mult === 100000) {
        current *= mult;
        total += current;
        current = 0;
      } else {
        current *= mult;
      }
      continue;
    }

    const numVal = parseInt(banglaDigitsToAscii(token), 10);
    if (!isNaN(numVal)) {
      current += numVal;
      continue;
    }
  }

  total += current;
  return total > 0 ? total : null;
}

export function numberToBanglaReadback(n: number): string {
  const wholePart = numberToBanglaWords(n);
  const digits = String(n)
    .split("")
    .map((d) => numberToBanglaWords(parseInt(d, 10)))
    .join(", ");
  return `${wholePart} — ${digits}`;
}

function numberToBanglaWords(n: number): string {
  if (n === 0) return "শূন্য";

  const parts: string[] = [];

  if (n >= 100000) {
    const lakhs = Math.floor(n / 100000);
    parts.push(smallNumberToBangla(lakhs) + " লাখ");
    n %= 100000;
  }

  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    parts.push(smallNumberToBangla(thousands) + " হাজার");
    n %= 1000;
  }

  if (n >= 100) {
    const hundreds = Math.floor(n / 100);
    parts.push(smallNumberToBangla(hundreds) + "শো");
    n %= 100;
  }

  if (n > 0) {
    parts.push(smallNumberToBangla(n));
  }

  return parts.join(" ");
}

const SMALL_NUMBERS: Record<number, string> = {
  1: "এক", 2: "দুই", 3: "তিন", 4: "চার", 5: "পাঁচ",
  6: "ছয়", 7: "সাত", 8: "আট", 9: "নয়", 10: "দশ",
  11: "এগারো", 12: "বারো", 13: "তেরো", 14: "চৌদ্দ", 15: "পনেরো",
  16: "ষোলো", 17: "সতেরো", 18: "আঠারো", 19: "উনিশ", 20: "বিশ",
  21: "একুশ", 22: "বাইশ", 23: "তেইশ", 24: "চব্বিশ", 25: "পঁচিশ",
  26: "ছাব্বিশ", 27: "সাতাশ", 28: "আঠাশ", 29: "উনত্রিশ", 30: "ত্রিশ",
  31: "একত্রিশ", 32: "বত্রিশ", 33: "তেত্রিশ", 34: "চৌত্রিশ", 35: "পঁয়ত্রিশ",
  36: "ছত্রিশ", 37: "সাতত্রিশ", 38: "আটত্রিশ", 39: "উনচল্লিশ", 40: "চল্লিশ",
  41: "একচল্লিশ", 42: "বিয়াল্লিশ", 43: "তেতাল্লিশ", 44: "চুয়াল্লিশ", 45: "পঁয়তাল্লিশ",
  46: "ছেচল্লিশ", 47: "সাতচল্লিশ", 48: "আটচল্লিশ", 49: "উনপঞ্চাশ", 50: "পঞ্চাশ",
  60: "ষাট", 70: "সত্তর", 80: "আশি", 90: "নব্বই",
};

function smallNumberToBangla(n: number): string {
  if (SMALL_NUMBERS[n]) return SMALL_NUMBERS[n];
  if (n > 50 && n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    return (SMALL_NUMBERS[tens] ?? "") + " " + (SMALL_NUMBERS[ones] ?? "");
  }
  return String(n);
}
