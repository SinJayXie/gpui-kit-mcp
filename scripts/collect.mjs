// Collect the GPUI Kit documentation index (llms.txt) and every referenced
// markdown page into a local corpus consumed by the MCP server.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE = "https://gpui-kit.com";
const OUT_DIR = path.resolve(process.cwd(), "data");
const CONCURRENCY = 8;

async function fetchText(url, { retries = 3 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "gpui-kit-mcp/0.1" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function parseLlmsTxt(text) {
  const entries = [];
  const re = /^- \[([^\]]+)\]\((\/[^)]+\.md)\)(?::\s*(.*))?$/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    entries.push({ title: match[1].trim(), path: match[2], description: (match[3] ?? "").trim() });
  }
  return entries;
}

export function splitFrontmatter(text) {
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: text };
  const raw = text.slice(3, end).trim();
  const data = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) data[key] = value;
  }
  return { data, body: text.slice(end + 4).trimStart() };
}

export function extractHeadings(markdown) {
  const headings = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{2,4})\s+(.+)$/.exec(line);
    if (match) headings.push(match[2].trim());
  }
  return headings;
}

function metaFromPath(docPath) {
  const segments = docPath.replace(/^\//, "").replace(/\.md$/, "").split("/");
  let lang = "en";
  if (segments[0] === "zh-CN") {
    lang = "zh";
    segments.shift();
  }
  const section = segments.length > 1 ? segments[0] : "root";
  const slug = segments[segments.length - 1];
  return { lang, section, slug, url: `${SITE}/${segments.join("/")}` };
}

async function main() {
  console.log(`Fetching ${SITE}/llms.txt`);
  const llms = await fetchText(`${SITE}/llms.txt`);
  const entries = parseLlmsTxt(llms);
  if (entries.length === 0) throw new Error("No documents found in llms.txt");
  console.log(`Found ${entries.length} documents`);

  const failures = [];
  let done = 0;

  const docs = await mapLimit(entries, CONCURRENCY, async (entry) => {
    try {
      const raw = await fetchText(`${SITE}${entry.path}`);
      const { data, body } = splitFrontmatter(raw);
      const meta = metaFromPath(entry.path);
      done += 1;
      if (done % 25 === 0 || done === entries.length) {
        console.log(`  ${done}/${entries.length}`);
      }
      return {
        path: entry.path,
        lang: meta.lang,
        section: meta.section,
        slug: meta.slug,
        title: entry.title,
        description: entry.description || data.description || "",
        url: meta.url,
        headings: extractHeadings(body),
        content: body,
      };
    } catch (err) {
      failures.push({ path: entry.path, error: String(err) });
      console.warn(`  failed ${entry.path}: ${err.message ?? err}`);
      return null;
    }
  });

  const collected = docs.filter(Boolean);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "llms.txt"), llms, "utf8");
  await writeFile(
    path.join(OUT_DIR, "docs.json"),
    `[\n${collected.map((doc) => JSON.stringify(doc)).join(",\n")}\n]\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "meta.json"),
    `${JSON.stringify(
      {
        source: `${SITE}/llms.txt`,
        generatedAt: new Date().toISOString(),
        documents: collected.length,
        failures,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Saved ${collected.length} documents to ${OUT_DIR}`);
  if (failures.length > 0) {
    console.warn(`${failures.length} document(s) failed; see data/meta.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
