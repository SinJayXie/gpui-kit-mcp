import type { DocEntry, DocLang } from "./types.js";
import { getDocs } from "./corpus.js";

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

export function matchesSection(doc: DocEntry, section?: string): boolean {
  if (!section || section === "all") return true;
  const normalized = section.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!normalized) return true;
  if (doc.section.toLowerCase() === normalized) return true;
  // Allow nested filters such as "base/primitives".
  return doc.path.includes(`/${normalized}/`);
}

export function matchesLang(doc: DocEntry, lang?: DocLang | "all"): boolean {
  return !lang || lang === "all" || doc.lang === lang;
}

function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_+#.]+/)
    .filter((token) => token.length > 0);
}

export function tokenize(text: string): string[] {
  const tokens = splitWords(text);
  const cjkRuns = text.match(/[\u3400-\u9fff\uf900-\ufaff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      tokens.push(run.slice(i, i + 2));
    }
  }
  return Array.from(new Set(tokens.filter(Boolean)));
}

function countOccurrences(haystack: string, needle: string, max = 10): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < max) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

interface IndexedDoc {
  doc: DocEntry;
  titleLower: string;
  descLower: string;
  headingsLower: string;
  contentLower: string;
  titleTokens: Set<string>;
}

let indexCache: IndexedDoc[] | null = null;

function getIndex(): IndexedDoc[] {
  if (!indexCache) {
    indexCache = getDocs().map((doc) => ({
      doc,
      titleLower: doc.title.toLowerCase(),
      descLower: doc.description.toLowerCase(),
      headingsLower: doc.headings.join(" \n ").toLowerCase(),
      contentLower: doc.content.toLowerCase(),
      titleTokens: new Set(tokenize(doc.title)),
    }));
  }
  return indexCache;
}

export interface SearchOptions {
  query: string;
  lang?: DocLang | "all";
  section?: string;
  limit?: number;
}

export interface SearchHit {
  doc: DocEntry;
  score: number;
  snippet: string;
}

function buildSnippet(content: string, needles: string[]): string {
  const lower = content.toLowerCase();
  let position = -1;
  for (const needle of needles) {
    if (!needle) continue;
    const found = lower.indexOf(needle);
    if (found !== -1 && (position === -1 || found < position)) position = found;
  }
  if (position === -1) position = 0;
  const start = Math.max(0, position - 180);
  const end = Math.min(content.length, position + 260);
  const text = content
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim();
  return `${start > 0 ? "…" : ""}${text}${end < content.length ? "…" : ""}`;
}

export function searchDocs(options: SearchOptions): SearchHit[] {
  const query = options.query.trim();
  if (!query) return [];
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const phrase = query.toLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 25);
  const queryIsCjk = hasCjk(query);

  const hits: SearchHit[] = [];
  for (const entry of getIndex()) {
    if (!matchesLang(entry.doc, options.lang) || !matchesSection(entry.doc, options.section)) continue;

    let score = 0;
    let matched = 0;

    if (entry.titleLower.includes(phrase)) score += 50;
    if (entry.titleLower === phrase) score += 40;
    if (entry.doc.slug.toLowerCase() === phrase.replace(/\s+/g, "-")) score += 20;

    for (const term of terms) {
      let hit = false;
      if (entry.titleTokens.has(term)) {
        score += 20;
        hit = true;
      } else if (entry.titleLower.includes(term)) {
        score += 10;
        hit = true;
      }
      if (entry.descLower.includes(term)) {
        score += 8;
        hit = true;
      }
      if (entry.headingsLower.includes(term)) {
        score += 5;
        hit = true;
      }
      const occurrences = countOccurrences(entry.contentLower, term);
      if (occurrences > 0) {
        score += Math.min(occurrences, 6) * 1.5;
        hit = true;
      }
      if (hit) matched += 1;
    }

    if (matched === 0) continue;

    score += (matched / terms.length) * 30;
    if (phrase.length > 2 && entry.contentLower.includes(phrase)) score += 8;
    if (queryIsCjk && entry.doc.lang === "zh") score += 12;
    if (!queryIsCjk && entry.doc.lang === "en") score += 8;
    if (options.lang !== "all" && options.lang && entry.doc.lang === options.lang) score += 4;

    hits.push({
      doc: entry.doc,
      score,
      snippet: buildSnippet(entry.doc.content, [phrase, ...terms]),
    });
  }

  hits.sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path));
  return hits.slice(0, limit);
}
