import type { DocEntry, DocLang } from "./types.js";
import { getDocs, getLlmsTxt, getMeta } from "./corpus.js";
import { hasCjk, matchesLang, searchDocs } from "./search.js";

function normalizePathInput(input: string): string {
  let value = input.trim();
  if (value.includes("://")) {
    try {
      value = new URL(value).pathname;
    } catch {
      // Keep the raw input when it is not a parsable URL.
    }
  }
  value = value.split("#")[0].split("?")[0];
  if (!value.startsWith("/")) value = `/${value}`;
  if (!value.endsWith(".md")) value = `${value}.md`;
  return value;
}

const SECTION_ORDER = ["component", "docs", "shell", "base", "root"];

function sortCandidates(candidates: DocEntry[], lang: DocLang | "all", query: string): DocEntry[] {
  const preferred: DocLang = lang !== "all" ? lang : hasCjk(query) ? "zh" : "en";
  const sectionRank = (doc: DocEntry) => {
    const rank = SECTION_ORDER.indexOf(doc.section);
    return rank === -1 ? SECTION_ORDER.length : rank;
  };
  return [...candidates].sort((a, b) => {
    const langDelta = Number(a.lang !== preferred) - Number(b.lang !== preferred);
    if (langDelta !== 0) return langDelta;
    const sectionDelta = sectionRank(a) - sectionRank(b);
    if (sectionDelta !== 0) return sectionDelta;
    return a.path.localeCompare(b.path);
  });
}

export interface ResolveResult {
  doc?: DocEntry;
  candidates: DocEntry[];
}

export function resolveDoc(input: string, lang: DocLang | "all" = "all"): ResolveResult {
  const docs = getDocs().filter((doc) => matchesLang(doc, lang));
  const raw = input.trim();
  if (!raw) return { candidates: [] };

  const wantedPath = normalizePathInput(raw).toLowerCase();
  const pathMatches = docs.filter((doc) => doc.path.toLowerCase() === wantedPath);
  if (pathMatches.length > 0) {
    const sorted = sortCandidates(pathMatches, lang, raw);
    return { doc: sorted[0], candidates: sorted };
  }

  const key = raw
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/^\/+|\/+$/g, "");
  const byTitle = docs.filter(
    (doc) => doc.title.toLowerCase() === key || doc.slug.toLowerCase() === key,
  );
  if (byTitle.length === 1) {
    return { doc: byTitle[0], candidates: byTitle };
  }
  if (byTitle.length > 1) {
    return { candidates: sortCandidates(byTitle, lang, raw) };
  }

  const fuzzy = searchDocs({ query: raw, lang, limit: 5 });
  return { candidates: fuzzy.map((hit) => hit.doc) };
}

interface Heading {
  index: number;
  level: number;
  text: string;
}

function scanHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = /^(#{1,6})\s+(.+)$/.exec(line);
      if (match) {
        headings.push({ index: offset, level: match[1].length, text: match[2].trim() });
      }
    }
    offset += line.length + 1;
  }
  return headings;
}

export function extractSection(markdown: string, section: string): string | null {
  const query = section.trim().replace(/^#+\s*/, "").toLowerCase();
  if (!query) return null;
  const headings = scanHeadings(markdown);
  const hit = headings.find((heading) => heading.text.toLowerCase().includes(query));
  if (!hit) return null;
  const next = headings.find((heading) => heading.index > hit.index && heading.level <= hit.level);
  return markdown.slice(hit.index, next ? next.index : markdown.length).trim();
}

export function outline(doc: DocEntry): string {
  return doc.headings.length > 0 ? doc.headings.map((heading) => `- ${heading}`).join("\n") : "(no sections)";
}

export interface RenderOptions {
  section?: string;
  maxChars?: number;
}

export function renderDoc(doc: DocEntry, options: RenderOptions = {}): string {
  const header = [
    `# ${doc.title}`,
    "",
    `- Path: ${doc.path}`,
    `- URL: ${doc.url}`,
    `- Section: ${doc.section} (${doc.lang === "zh" ? "zh-CN" : "en"})`,
    `- Description: ${doc.description}`,
    "",
    "---",
    "",
  ].join("\n");

  const body = doc.content.replace(/^#\s+.*\n+/, "");
  let text = body;
  let notice = "";

  if (options.section) {
    const extracted = extractSection(body, options.section);
    if (!extracted) {
      return `${header}Section "${options.section}" was not found. Available sections:\n\n${outline(doc)}\n`;
    }
    text = extracted;
    notice = `> Showing only the "${options.section}" section.\n\n`;
  }

  const maxChars = options.maxChars && options.maxChars > 0 ? options.maxChars : 24000;
  if (text.length > maxChars) {
    const cutAt = text.lastIndexOf("\n", maxChars);
    const head = text.slice(0, cutAt > 0 ? cutAt : maxChars);
    const remaining = scanHeadings(text)
      .filter((heading) => heading.index > head.length)
      .map((heading) => `- ${heading.text}`)
      .join("\n");
    text =
      `${head}\n\n> Truncated: showing ${head.length} of ${text.length} characters.` +
      (remaining ? ` Remaining sections:\n>\n${remaining.split("\n").map((line) => `> ${line}`).join("\n")}` : "") +
      `\n> Call get_doc with section="<heading>" to read a specific part, or raise maxChars (max 120000).\n`;
  }

  return `${header}${notice}${text}\n`;
}

export function renderCandidates(query: string, candidates: DocEntry[], lang: DocLang | "all"): string {
  if (candidates.length === 0) {
    return `No GPUI Kit documentation page matched "${query}" (language: ${lang}). Try search_docs with a broader keyword.`;
  }
  const lines = candidates.map(
    (doc) => `- ${doc.title} — ${doc.path} (${doc.lang === "zh" ? "zh-CN" : "en"}, ${doc.section})\n  ${doc.description}`,
  );
  return [
    `"${query}" matched ${candidates.length} pages. Call get_doc again with one of these paths:`,
    "",
    ...lines,
  ].join("\n");
}

export function renderDocsIndex(lang: DocLang | "all" = "all", section?: string): string {
  const llms = getLlmsTxt();
  const lines = llms.split("\n");
  const tocIndex = lines.findIndex((line) => line.trim().toLowerCase() === "## table of contents");
  const meta = getMeta();
  const metaLine = meta
    ? `> Corpus snapshot: ${meta.documents} pages, collected ${meta.generatedAt}.\n`
    : "";

  if (tocIndex === -1) return `${metaLine}\n${llms}`;

  const header = lines.slice(0, tocIndex).join("\n").trimEnd();
  const entries = lines.slice(tocIndex + 1).filter((line) => {
    const match = /^- \[[^\]]+\]\((\/[^)]+\.md)\)/.exec(line);
    if (!match) return false;
    const docPath = match[1];
    const docLang: DocLang = docPath.startsWith("/zh-CN/") ? "zh" : "en";
    if (lang !== "all" && docLang !== lang) return false;
    if (!section || section === "all") return true;
    const segments = docPath.replace(/^\//, "").replace(/^zh-CN\//, "").split("/");
    const docSection = segments.length > 1 ? segments[0] : "root";
    return docSection === section || docPath.includes(`/${section}/`);
  });

  return `${metaLine}${header}\n\n## Table of Contents\n\n${entries.join("\n")}\n`;
}
