export interface FuzzyMatchResult {
  matched: boolean;
  best_match: string | null;
  all_matches: Array<{ name: string; distance: number }>;
  is_ambiguous: boolean;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const BANGLA_SUFFIXES = ["কে", "র", "তে", "দের", "ের", "এর", "রে", "য়", "ক"];

function stripSuffixes(word: string): string[] {
  const variants = [word];
  for (const suffix of BANGLA_SUFFIXES) {
    if (word.endsWith(suffix) && word.length > suffix.length + 1) {
      variants.push(word.slice(0, -suffix.length));
    }
  }
  return variants;
}

function extractCandidates(input: string): string[] {
  const candidates: string[] = [input.trim()];
  const words = input.trim().split(/[\s,।.]+/).filter(w => w.length > 0);
  for (const word of words) {
    candidates.push(word);
    for (const variant of stripSuffixes(word)) {
      if (variant !== word) candidates.push(variant);
    }
  }
  return [...new Set(candidates)];
}

export function fuzzyMatchRecipient(
  input: string,
  recipients: string[],
  threshold = 3
): FuzzyMatchResult {
  const candidates = extractCandidates(input.toLowerCase());

  // Check exact match first
  for (const candidate of candidates) {
    const exact = recipients.find((r) => r.toLowerCase() === candidate);
    if (exact) {
      return {
        matched: true,
        best_match: exact,
        all_matches: [{ name: exact, distance: 0 }],
        is_ambiguous: false,
      };
    }
  }

  // Check contains — if input contains the full recipient name
  for (const name of recipients) {
    if (input.toLowerCase().includes(name.toLowerCase())) {
      return {
        matched: true,
        best_match: name,
        all_matches: [{ name, distance: 0 }],
        is_ambiguous: false,
      };
    }
  }

  // Fuzzy match each candidate against each recipient
  const allScored: Array<{ name: string; distance: number }> = [];
  for (const candidate of candidates) {
    for (const name of recipients) {
      const dist = levenshtein(candidate, name.toLowerCase());
      if (dist <= threshold) {
        const existing = allScored.find(s => s.name === name);
        if (!existing || dist < existing.distance) {
          if (existing) existing.distance = dist;
          else allScored.push({ name, distance: dist });
        }
      }
    }
  }

  allScored.sort((a, b) => a.distance - b.distance);

  if (allScored.length === 0) {
    return { matched: false, best_match: null, all_matches: [], is_ambiguous: false };
  }

  if (allScored.length === 1) {
    return {
      matched: true,
      best_match: allScored[0].name,
      all_matches: allScored,
      is_ambiguous: false,
    };
  }

  if (allScored[0].distance < allScored[1].distance) {
    return {
      matched: true,
      best_match: allScored[0].name,
      all_matches: allScored,
      is_ambiguous: false,
    };
  }

  return {
    matched: false,
    best_match: null,
    all_matches: allScored,
    is_ambiguous: true,
  };
}
