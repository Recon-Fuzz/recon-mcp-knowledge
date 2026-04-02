# @recon-fuzz/mcp-knowledge

MCP server that makes Recon documentation searchable by AI tools. Fetches and parses [getrecon.xyz/llms-full.txt](https://getrecon.xyz/llms-full.txt) into structured, queryable content.

## Tools

| Tool | Input | Returns |
|------|-------|---------|
| `search_glossary` | `query: string` | Top 5 matching glossary terms with definitions |
| `get_blog_post` | `slug: string` | Full post content + metadata + URL |
| `get_comparison` | `slug: string` | Both entities, strengths, conclusion, FAQs |
| `search_content` | `query: string` | Top 10 matches across all content types |
| `list_tools` | _(none)_ | Developer tools with descriptions + URLs |
| `refresh_cache` | _(none)_ | Force re-fetch of documentation (rate limited to 1/min) |

## Setup for Claude Desktop / Cursor

Add to your MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` or Cursor settings):

```json
{
  "mcpServers": {
    "recon-knowledge": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-knowledge"]
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
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_content","arguments":{"query":"chimera"}},"id":2}' | node dist/index.js
```

## Validation steps

Before making this repo public or publishing to npm, verify the following:

### 1. Functional checks

- [ ] `npm run build` compiles with zero errors
- [ ] `tools/list` returns 6 tools
- [ ] `search_glossary` with query `"fuzzing"` returns relevant terms
- [ ] `get_blog_post` with slug `"why-we-built-chimera-write-once-fuzz-everywhere"` returns the full post
- [ ] `search_content` with query `"chimera"` returns the new Chimera architecture post
- [ ] `refresh_cache` works and respects rate limiting (second call within 60s returns early)
- [ ] `get_comparison` returns both entities' strengths (not just entity A)

### 2. Security checks

- [ ] `@modelcontextprotocol/sdk` is pinned to `^1.29.0` (not `"latest"`)
- [ ] Fetch response size is capped at 10MB
- [ ] `refresh_cache` is rate-limited (60s minimum interval)
- [ ] Query/slug inputs are length-limited (1000/500 chars)
- [ ] Error messages don't expose upstream network details
- [ ] Fetch uses `redirect: "error"` to prevent redirect following
- [ ] No env vars read, no data sent to any third party, no telemetry

### 3. Pre-publish checks

- [ ] Add `"files": ["dist"]` to package.json before npm publish
- [ ] Set `"sourceMap": false` in tsconfig.json for production
- [ ] Run `npm audit` — should report 0 vulnerabilities
- [ ] Test with Claude Desktop or Cursor — verify tools appear and respond

### 4. Content quality

- [ ] `search_content("chimera")` returns the "Why we built Chimera" post
- [ ] `search_content("vscode extension")` returns the extension guide
- [ ] Glossary terms are parsed correctly (no `####` prefixes in definitions)
- [ ] Comparison articles include both sides' strengths

## Architecture

- Fetches `llms-full.txt` once on startup, caches in memory
- Cache refreshes every 24h automatically or on manual `refresh_cache`
- Parser splits by `---` dividers, extracts blog posts, glossary, comparisons, tools
- Search uses case-insensitive term matching with word-boundary scoring
- No database, no external search library, no filesystem writes

## Privacy

This server is read-only. It fetches from a single hardcoded public URL (`getrecon.xyz/llms-full.txt`). No user queries, tool arguments, or any data is sent to Recon or any third party.
