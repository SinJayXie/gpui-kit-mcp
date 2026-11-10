export type DocLang = "en" | "zh";

export interface DocEntry {
  /** Site path of the markdown source, e.g. "/component/button.md". */
  path: string;
  lang: DocLang;
  /** Top-level section: docs, base, component, shell or root. */
  section: string;
  slug: string;
  title: string;
  description: string;
  url: string;
  headings: string[];
  content: string;
}

export interface DocMeta {
  source: string;
  generatedAt: string;
  documents: number;
  failures: Array<{ path: string; error: string }>;
}
