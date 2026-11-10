import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocEntry, DocMeta } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.resolve(here, "..", "data");

let docsCache: DocEntry[] | null = null;
let llmsCache: string | null = null;
let metaCache: DocMeta | null = null;

function readDataFile(name: string): string {
  try {
    return readFileSync(path.join(dataDir, name), "utf8");
  } catch {
    throw new Error(
      `Missing data/${name}. Run "npm run collect" in ${path.resolve(dataDir, "..")} to download the GPUI Kit docs.`,
    );
  }
}

export function getDocs(): DocEntry[] {
  if (!docsCache) {
    docsCache = JSON.parse(readDataFile("docs.json")) as DocEntry[];
  }
  return docsCache;
}

export function getLlmsTxt(): string {
  if (!llmsCache) {
    llmsCache = readDataFile("llms.txt");
  }
  return llmsCache;
}

export function getMeta(): DocMeta | null {
  if (!metaCache) {
    try {
      metaCache = JSON.parse(readDataFile("meta.json")) as DocMeta;
    } catch {
      return null;
    }
  }
  return metaCache;
}
