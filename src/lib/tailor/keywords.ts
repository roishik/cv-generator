// Shared pure keyword/tokenization helpers for JD↔CV analysis: the relevance-
// weighted cut scorer (suggest-cuts.ts) and the fit score (fit-score.ts) both
// reduce free text to a comparable bag of significant tokens.
// PURE: no DB, no auth, no network.

/**
 * Stopwords: common English function words plus job-posting boilerplate that
 * carries no signal about role-fit ("experience", "team", "required", "years").
 * Kept deliberately tight so genuine signal words are never dropped.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // articles / conjunctions / prepositions / pronouns
  "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "by", "for", "with", "from", "as", "is", "are", "be", "been", "being", "was",
  "were", "it", "its", "we", "our", "us", "you", "your", "they", "their", "them",
  "this", "that", "these", "those", "i", "he", "she", "his", "her", "do", "does",
  "will", "would", "can", "could", "should", "may", "might", "have", "has", "had",
  "not", "no", "so", "than", "then", "into", "out", "up", "down", "over", "who",
  "what", "which", "when", "where", "how", "all", "any", "each", "more", "most",
  "other", "some", "such", "only", "own", "same", "also", "about", "across",
  // job-posting boilerplate
  "experience", "experienced", "role", "job", "position", "work", "working",
  "team", "teams", "company", "candidate", "candidates", "ability", "able",
  "strong", "years", "year", "required", "require", "requirements", "preferred",
  "plus", "join", "looking", "hiring", "hire", "seeking", "want", "need", "needs",
  "responsibilities", "responsible", "skills", "skill", "knowledge", "etc",
  "including", "include", "well", "good", "great", "help", "helping", "new",
  "using", "use", "used", "within", "must", "ideal", "ideally", "you'll", "we're",
  // seniority / generic-verb boilerplate that adds noise to fit gaps
  "senior", "junior", "mid", "lead", "run", "drive", "among", "various", "daily",
]);

const TOKEN_RE = /[a-z0-9][a-z0-9+#]*/g;

/**
 * Tokenize free text into significant lower-cased tokens, PRESERVING duplicates
 * (for frequency). Keeps 2-char tech tokens (ai, ml, go, ci, cd) and `+`/`#`
 * suffixes (c++, c#); drops stopwords and 1-char noise.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(TOKEN_RE)) {
    const t = m[0];
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    out.push(t);
  }
  return out;
}

/** Unique significant tokens of `text`. */
export function keywordSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Number of distinct tokens present in BOTH sets. */
export function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

// Suffixes stripped by `stem`, ordered longest/most-specific first so only ONE
// (the best) is removed. Deliberately conservative — this is a recall aid for
// keyword overlap (developers≈developer, experiments≈experimentation), not a
// linguistic stemmer.
const STEM_SUFFIXES = [
  "ization", "isation", "ities", "ation", "ously", "ment", "ness",
  "ies", "ied", "ing", "ers", "ize", "ise", "ed", "es", "er", "ly", "s",
];

/**
 * Reduce a token to a crude stem so morphological variants collide. Strips at
 * most one trailing suffix and only when ≥3 characters remain (so short tech
 * tokens like "api"/"ml" are never mangled).
 */
export function stem(token: string): string {
  for (const suf of STEM_SUFFIXES) {
    if (token.length - suf.length >= 3 && token.endsWith(suf)) {
      return token.slice(0, token.length - suf.length);
    }
  }
  return token;
}

/** Unique stemmed significant tokens of `text`. */
export function stemSet(text: string): Set<string> {
  return new Set(tokenize(text).map(stem));
}
