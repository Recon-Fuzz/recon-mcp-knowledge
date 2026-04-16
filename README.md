# @recon-fuzz-mcp/knowledge

[![npm](https://img.shields.io/npm/v/@recon-fuzz-mcp/knowledge.svg)](https://www.npmjs.com/package/@recon-fuzz-mcp/knowledge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

MCP server that makes Recon documentation searchable by AI tools. Fetches and parses [getrecon.xyz/llms-full.txt](https://getrecon.xyz/llms-full.txt) into structured, queryable content.

## Tools

### Site tools (getrecon.xyz)

| Tool | Input | Returns |
|------|-------|---------|
| `search_glossary` | `query: string` | Top 5 matching glossary terms with definitions |
| `get_blog_post` | `slug: string` | Full post content + metadata + URL |
| `get_comparison` | `slug: string` | Both entities, strengths, conclusion, FAQs |
| `search_site` | `query: string` | Top 10 matches across site content |
| `list_tools` | _(none)_ | Developer tools with descriptions + URLs |

### Book tools (book.getrecon.xyz)

| Tool | Input | Returns |
|------|-------|---------|
| `get_book_chapter` | `slug: string` | Full chapter content, category, URL |
| `get_book_concept` | `slug: string` | Technical concept explanation |
| `search_book` | `query: string` | Top 10 matches across book content |
| `list_book_chapters` | _(none)_ | All chapters grouped by category |

### Substack tools (getrecon.substack.com)

| Tool | Input | Returns |
|------|-------|---------|
| `get_substack_post` | `slug: string` | Full newsletter post content |
| `search_substack` | `query: string` | Top 10 matches across Substack posts |
| `list_substack_posts` | _(none)_ | All posts sorted by date |

### Cross-source

| Tool | Input | Returns |
|------|-------|---------|
| `search_all` | `query: string` | Top 15 matches across all 3 sources |
| `refresh_cache` | _(none)_ | Re-fetch all sources (rate limited to 1/min) |

## Installation

### Claude Code

```bash
claude mcp add recon-knowledge -- npx @recon-fuzz-mcp/knowledge
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "recon-knowledge": {
      "command": "npx",
      "args": ["@recon-fuzz-mcp/knowledge"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "recon-knowledge": {
      "command": "npx",
      "args": ["@recon-fuzz-mcp/knowledge"]
    }
  }
}
```

No API key needed. The server fetches public documentation only.

## Local development

```bash
git clone https://github.com/Recon-Fuzz/recon-mcp-knowledge.git
cd recon-mcp-knowledge
npm install
npm run build
```

### Test it works

```bash
# List tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js

# Search for chimera content
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_site","arguments":{"query":"chimera"}},"id":2}' | node dist/index.js
```

## Architecture

- Fetches `llms-full.txt` once on startup, caches in memory
- Cache refreshes every 24h automatically or on manual `refresh_cache`
- Parser splits by `---` dividers, extracts blog posts, glossary, comparisons, tools
- Search uses case-insensitive term matching with word-boundary scoring
- No database, no external search library, no filesystem writes

## Privacy

This server is read-only. It fetches from a single hardcoded public URL (`getrecon.xyz/llms-full.txt`). No user queries, tool arguments, or any data is sent to Recon or any third party.
