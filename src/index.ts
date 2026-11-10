#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDocs, getMeta } from "./corpus.js";
import type { DocLang } from "./types.js";
import { searchDocs } from "./search.js";
import { renderCandidates, renderDoc, renderDocsIndex, resolveDoc } from "./docs.js";

const VERSION = "0.1.0";

const USAGE = `gpui-kit-mcp v${VERSION} - MCP server for GPUI Kit documentation

Usage:
  gpui-kit-mcp              Start the MCP server on stdio
  gpui-kit-mcp --version    Print the version
  gpui-kit-mcp --help       Print this help

Run with npx:
  npx gpui-kit-mcp

MCP client configuration:
  {
    "mcpServers": {
      "gpui-kit": { "command": "npx", "args": ["-y", "gpui-kit-mcp"] }
    }
  }
`;

const langSchema = z
  .enum(["en", "zh", "all"])
  .optional()
  .describe('Documentation language: "all" (default, auto-prefers the query language), "en", or "zh" (zh-CN).');

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

function formatHits(query: string, hits: ReturnType<typeof searchDocs>): string {
  if (hits.length === 0) {
    return `No GPUI Kit documentation matched "${query}". Try a different keyword (for example "button", "focus", "style", "virtual list").`;
  }
  const lines = [`Found ${hits.length} page(s) for "${query}":`, ""];
  hits.forEach((hit, i) => {
    const langLabel = hit.doc.lang === "zh" ? "zh-CN" : "en";
    lines.push(`${i + 1}. ${hit.doc.title} — ${hit.doc.path} (${langLabel}, ${hit.doc.section})`);
    if (hit.doc.description) lines.push(`   ${hit.doc.description}`);
    lines.push(`   ${hit.snippet}`);
    lines.push("");
  });
  lines.push('Read a page with get_doc, passing one of the paths above.');
  return lines.join("\n");
}

const server = new McpServer(
  { name: "gpui-kit", version: VERSION },
  {
    instructions:
      "GPUI Kit is a Rust desktop framework built on GPUI, with gpui-base primitives, gpui-component widgets and gpui-shell JavaScript hosting. " +
      "Use search_docs to find relevant pages, then get_doc to read the full Markdown page (optionally one section at a time). " +
      "Use list_docs or get_docs_index to browse the catalog. Documentation is available in English and Chinese (zh-CN).",
  },
);

server.registerTool(
  "search_docs",
  {
    title: "Search GPUI Kit docs",
    description:
      "Full-text search across all GPUI Kit documentation (guides, gpui-base primitives, components, gpui-shell). " +
      "Returns matching pages with title, path, description and a content snippet. Start here, then call get_doc with the returned path.",
    inputSchema: {
      query: z.string().min(1).describe('Search keywords, e.g. "button loading", "focus trap", "data table", "按钮".'),
      lang: langSchema,
      section: z
        .string()
        .optional()
        .describe('Restrict to a section: "docs", "base", "component", "shell", or a path prefix such as "base/primitives".'),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum results (default 8, max 25)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, lang, section, limit }) => {
    try {
      return textResult(formatHits(query, searchDocs({ query, lang, section, limit })));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "get_doc",
  {
    title: "Read a GPUI Kit doc page",
    description:
      "Read a GPUI Kit documentation page as Markdown. Accepts a path from search_docs (for example /component/button.md) " +
      "or a page title/slug such as \"Button\". Use `section` to return only one heading's content on long pages. " +
      "When a title matches several pages, the available paths are returned so you can choose.",
    inputSchema: {
      path: z.string().min(1).describe('Page path ("/component/button.md"), URL, or title/slug ("Button").'),
      lang: langSchema,
      section: z
        .string()
        .optional()
        .describe('Return only the section whose heading contains this text, e.g. "Usage" or "Variants".'),
      maxChars: z
        .number()
        .int()
        .min(1000)
        .max(120000)
        .optional()
        .describe("Maximum characters of page body to return (default 24000)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path, lang, section, maxChars }) => {
    try {
      const resolved = resolveDoc(path, lang ?? "all");
      if (resolved.doc) {
        return textResult(renderDoc(resolved.doc, { section, maxChars }));
      }
      return textResult(renderCandidates(path, resolved.candidates, lang ?? "all"));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "list_docs",
  {
    title: "List GPUI Kit docs",
    description:
      "List GPUI Kit documentation pages, optionally filtered by language, section, or a keyword matched against title and description. " +
      "Useful for browsing what is available before reading a page.",
    inputSchema: {
      lang: langSchema,
      section: z.string().optional().describe('Filter by section: "docs", "base", "component", "shell", or a path prefix.'),
      query: z.string().optional().describe("Optional keyword matched against page titles and descriptions."),
      limit: z.number().int().min(1).max(400).optional().describe("Maximum pages to list (default 100)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ lang, section, query, limit }) => {
    try {
      const normalizedSection = section?.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
      const keyword = query?.trim().toLowerCase();
      const max = limit ?? 100;
      const matches = getDocs()
        .filter((doc) => (!lang || lang === "all" || doc.lang === lang))
        .filter((doc) => {
          if (!normalizedSection || normalizedSection === "all") return true;
          return doc.section.toLowerCase() === normalizedSection || doc.path.includes(`/${normalizedSection}/`);
        })
        .filter((doc) => {
          if (!keyword) return true;
          return (
            doc.title.toLowerCase().includes(keyword) ||
            doc.description.toLowerCase().includes(keyword) ||
            doc.slug.includes(keyword)
          );
        });

      if (matches.length === 0) {
        return textResult("No pages matched the given filters.");
      }

      const shown = matches.slice(0, max);
      const lines = [
        `GPUI Kit docs: ${matches.length} page(s) matched${matches.length > shown.length ? `, showing ${shown.length}` : ""}.`,
        "",
        ...shown.map((doc) => {
          const langLabel = doc.lang === "zh" ? "zh-CN" : "en";
          return `- ${doc.title} — ${doc.path} (${langLabel}, ${doc.section})${doc.description ? `: ${doc.description}` : ""}`;
        }),
      ];
      if (matches.length > shown.length) {
        lines.push("", `Increase limit (up to 400) or narrow the filters to see the remaining ${matches.length - shown.length} page(s).`);
      }
      return textResult(lines.join("\n"));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "get_docs_index",
  {
    title: "Get GPUI Kit llms.txt index",
    description:
      "Return the collected https://gpui-kit.com/llms.txt index: every documentation page with its path and one-line description. " +
      "Filter by language or section to keep the response small.",
    inputSchema: {
      lang: langSchema,
      section: z.string().optional().describe('Filter by section: "docs", "base", "component", "shell", or a path prefix.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ lang, section }) => {
    try {
      return textResult(renderDocsIndex(lang ?? "all", section));
    } catch (error) {
      return errorResult(error);
    }
  },
);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  try {
    const docs = getDocs();
    const meta = getMeta();
    console.error(
      `gpui-kit-mcp v${VERSION}: loaded ${docs.length} docs from ${meta?.source ?? "local corpus"}${
        meta ? ` (collected ${meta.generatedAt})` : ""
      }`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gpui-kit-mcp: ready on stdio");
}

main().catch((error) => {
  console.error("gpui-kit-mcp failed to start:", error);
  process.exit(1);
});
