# gpui-kit-mcp

[English](https://github.com/SinJayXie/gpui-kit-mcp/blob/main/README.md) | 简体中文

[GPUI Kit](https://gpui-kit.com) 官方文档的 MCP（Model Context Protocol）服务器。

把 GPUI Kit 文档全量打包成本地语料，让 Claude Code、Cursor、Trae 等 AI 客户端直接检索和阅读指南、gpui-base 原语、gpui-component 组件以及 gpui-shell 文档，查询不依赖网络。

## 特性

- 全量离线语料：自动采集 `https://gpui-kit.com/llms.txt` 中的全部 376 篇文档（英文 + 简体中文）
- 中英文检索：英文按词切分，中文按 bigram 索引，自动跟随提问语言排序
- 按章节读取：长文档可以只取某个标题下的内容，避免一次塞满上下文
- 零配置：标准 stdio MCP server，`npx` 一行接入

## 快速开始

```bash
npx -y @dishuyl/gpui-kit-mcp --help
```

### 配置 MCP 客户端

Claude Desktop、Cursor、Trae 等客户端：

```json
{
  "mcpServers": {
    "gpui-kit": {
      "command": "npx",
      "args": ["-y", "@dishuyl/gpui-kit-mcp"]
    }
  }
}
```

Windows 上如果客户端无法直接拉起 `npx`，改用：

```json
{
  "mcpServers": {
    "gpui-kit": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@dishuyl/gpui-kit-mcp"]
    }
  }
}
```

## 工具

| 工具 | 说明 | 主要参数 |
| --- | --- | --- |
| `search_docs` | 全文检索文档，返回路径、描述和命中片段 | `query`、`lang`、`section`、`limit` |
| `get_doc` | 读取整篇文档或指定章节 | `path`、`lang`、`section`、`maxChars` |
| `list_docs` | 按语言、分节、关键词浏览目录 | `lang`、`section`、`query`、`limit` |
| `get_docs_index` | 返回采集到的 `llms.txt` 索引 | `lang`、`section` |

`lang` 可选 `all`（默认，自动偏向提问语言）、`en`、`zh`；`section` 可选 `docs`、`base`、`component`、`shell` 或 `base/primitives` 这类路径前缀。

### 使用示例

```
用 search_docs 搜索 "data table virtual scroll"
用 get_doc 读取 /component/data-table.md 的 "Column Types" 章节
用 get_docs_index 列出 zh 的 shell 文档
```

## 本地开发

```bash
git clone https://github.com/SinJayXie/gpui-kit-mcp.git
cd gpui-kit-mcp
npm install
npm run collect   # 重新采集 gpui-kit.com 文档
npm run build     # 编译到 dist/
node dist/index.js
```

重新采集后会生成：

- `data/llms.txt`：文档索引快照
- `data/docs.json`：全部页面内容
- `data/meta.json`：采集时间、页面数量、失败列表

## 许可

代码以 [MIT](https://github.com/SinJayXie/gpui-kit-mcp/blob/main/LICENSE) 许可发布。

内置文档语料来自 [gpui-kit.com](https://gpui-kit.com)，原文档中的文字与插图采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，代码示例采用 Apache-2.0。转载或再分发时请保留 GPUI Kit 署名并注明来源。
