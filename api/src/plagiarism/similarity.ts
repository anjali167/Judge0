/**
 * Source-similarity detection — pure logic, unit-tested in test/similarity.test.ts.
 *
 * MOSS-style pipeline (Schleimer, Wilkerson, Aiken — "Winnowing: Local
 * Algorithms for Document Fingerprinting"):
 *   1. normalize: strip comments/strings/whitespace, canonicalize identifiers
 *      and numbers so renaming variables doesn't hide copying
 *   2. k-gram hashing over the token stream
 *   3. winnowing: keep the minimum hash in each sliding window → fingerprint set
 *   4. similarity = Jaccard overlap of fingerprint sets
 *
 * Self-contained by design (no external Dolos/MOSS service): zero ops burden,
 * runs post-contest in-process. Flags are signals for organizer review —
 * never auto-punishment (spec 5.6).
 */

const KEYWORDS = new Set([
  // shared across the launch languages; keywords keep their identity
  "if","else","for","while","do","return","break","continue","switch","case",
  "default","int","long","float","double","char","void","bool","true","false",
  "struct","class","public","private","static","const","new","delete","include",
  "def","elif","import","from","in","not","and","or","None","True","False",
  "print","range","len","function","let","var","const","=>","async","await",
  "try","except","catch","finally","throw","raise","with","as","pass","lambda",
  "std","using","namespace","main","string","vector","map","set","input",
]);

/**
 * Language-agnostic tokenizer: drops comments and string/char literals,
 * canonicalizes identifiers to `V` and numbers to `N`, keeps keywords,
 * operators and punctuation.
 */
export function normalizeTokens(source: string): string[] {
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* */
    .replace(/\/\/[^\n]*/g, " ") // //
    .replace(/(^|[^:])#[^\n]*/g, "$1 ") // # (python) — keep #include's include via keyword list loss; acceptable
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, " S ")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, " S ");

  const raw = noComments.match(/[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|==|!=|<=|>=|&&|\|\||\+\+|--|<<|>>|->|=>|[-+*/%=<>!&|^~?:;,.(){}[\]]/g);
  if (!raw) return [];
  return raw.map((t) => {
    if (/^[A-Za-z_]/.test(t)) return KEYWORDS.has(t) ? t : "V";
    if (/^\d/.test(t)) return "N";
    return t;
  });
}

/** FNV-1a over a token window. */
function hashKGram(tokens: string[], start: number, k: number): number {
  let h = 2166136261;
  for (let i = start; i < start + k; i++) {
    const s = tokens[i];
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    h ^= 31; // token separator
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Winnowed fingerprint set. k = noise threshold (matches shorter than k tokens
 * are ignored); w = window (guarantee: any match of length >= k+w-1 is caught).
 */
export function fingerprints(source: string, k = 15, w = 8): Set<number> {
  const tokens = normalizeTokens(source);
  const out = new Set<number>();
  if (tokens.length < k) {
    if (tokens.length > 0) out.add(hashKGram(tokens, 0, tokens.length));
    return out;
  }
  const hashes: number[] = [];
  for (let i = 0; i + k <= tokens.length; i++) hashes.push(hashKGram(tokens, i, k));

  if (hashes.length <= w) {
    out.add(Math.min(...hashes));
    return out;
  }
  for (let i = 0; i + w <= hashes.length; i++) {
    let min = hashes[i];
    for (let j = i + 1; j < i + w; j++) if (hashes[j] < min) min = hashes[j];
    out.add(min);
  }
  return out;
}

/** Jaccard similarity of two fingerprint sets, in [0, 1]. */
export function similarity(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function sourceSimilarity(srcA: string, srcB: string, k = 15, w = 8): number {
  return similarity(fingerprints(srcA, k, w), fingerprints(srcB, k, w));
}
