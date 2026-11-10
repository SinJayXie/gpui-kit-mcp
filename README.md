# gpui-kit-mcp

English | [简体中文](https://github.com/SinJayXie/gpui-kit-mcp/blob/main/README.zh-CN.md)

MCP (Model Context Protocol) server for the [GPUI Kit](https://gpui-kit.com) documentation.

It bundles the full GPUI Kit documentation into a local corpus so AI clients such as Claude Code, Cursor and Trae can search and read the guides, gpui-base primitives, gpui-component widgets and gpui-shell docs without network access.

## Features

- Complete offline corpus: all 376 pages listed in `https://gpui-kit.com/llms.txt` (English and Simplified Chinese)
- Bilingual search: word-based indexing for English, bigram indexing for Chinese, with automatic language preference based on the query
- Section-level reads: fetch only the content under one heading on long pages to keep context small
- Zero configuration: standard stdio MCP server, one `npx` command to connect

## Quick start

```bash
npx -y gpui-kit-mcp --help
```

### MCP client configuration

For Claude Desktop, Cursor, Trae and other MCP clients:

```json
{
  "mcpServers": {
    "gpui-kit": {
      "command": "npx",
      "args": ["-y", "gpui-kit-mcp"]
    }
  }
}
```

On Windows, if the client cannot launch `npx` directly, use:

```json
{
  "mcpServers": {
    "gpui-kit": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "gpui-kit-mcp"]
    }
  }
}
```

## Tools

| Tool | Description | Main parameters |
| --- | --- | --- |
| `search_docs` | Full-text search with path, description and matching snippet | `query`, `lang`, `section`, `limit` |
| `get_doc` | Read a whole page or a single section | `path`, `lang`, `section`, `maxChars` |
| `list_docs` | Browse pages filtered by language, section or keyword | `lang`, `section`, `query`, `limit` |
| `get_docs_index` | Return the collected `llms.txt` index | `lang`, `section` |

`lang` accepts `all` (default, auto-prefers the query language), `en` or `zh`. `section` accepts `docs`, `base`, `component`, `shell` or a path prefix such as `base/primitives`.

### Examples

```
Use search_docs to search for "data table virtual scroll"
Use get_doc to read the "Column Types" section of /component/data-table.md
Use get_docs_index to list the shell docs in zh
```

## Development

```bash
git clone https://github.com/SinJayXie/gpui-kit-mcp.git
cd gpui-kit-mcp
npm install
npm run collect   # re-download the gpui-kit.com docs
npm run build     # compile to dist/
node dist/index.js
```

`npm run collect` writes:

- `data/llms.txt`: snapshot of the documentation index
- `data/docs.json`: all page contents
- `data/meta.json`: collection time, page count and failures

## License

Code is released under the [MIT](https://github.com/SinJayXie/gpui-kit-mcp/blob/main/LICENSE) license.

The bundled documentation comes from [gpui-kit.com](https://gpui-kit.com). Its prose and illustrations are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and code examples under Apache-2.0. Keep the GPUI Kit attribution and source link when redistributing.
