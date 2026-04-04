# MCP activation guide

How to go from a private repo to a live MCP server that AI tools discover and use.

## Step 1: Claim the npm scope (one-time)

```bash
npm org create recon-fuzz
npm team add recon-fuzz:developers alex
npm team add recon-fuzz:developers deivitto
```

## Step 2: Publish to npm

```bash
cd /path/to/recon-mcp-knowledge  # or chimera, or pro
npm login
npm publish --access public      # use --access restricted for recon-mcp-pro
```

Verify: `npx @recon-fuzz/mcp-knowledge` should start and wait for MCP input.

For updates:
```bash
npm version patch   # or minor/major
npm publish
```

## Step 3: Publish to the official MCP Registry

The official registry at `registry.modelcontextprotocol.io` is the primary distribution channel.

```bash
# Install the publisher CLI
brew install mcp-publisher

# Generate server.json (one-time)
mcp-publisher init

# Authenticate via GitHub
mcp-publisher login github

# Publish
mcp-publisher publish
```

The `server.json` file should look like:
```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.recon-fuzz/mcp-knowledge",
  "description": "Search all Recon documentation — getrecon.xyz, book.getrecon.xyz, and getrecon.substack.com",
  "repository": { "url": "https://github.com/Recon-Fuzz/recon-mcp-knowledge", "source": "github" },
  "version": "2.1.1",
  "packages": [{
    "registryType": "npm",
    "identifier": "@recon-fuzz/mcp-knowledge",
    "version": "2.1.1",
    "transport": { "type": "stdio" }
  }]
}
```

For recon-mcp-pro, add environment variables:
```json
"environmentVariables": [
  { "name": "RECON_API_KEY", "description": "Recon Pro API key from getrecon.xyz/settings/api", "isRequired": true, "isSecret": true, "format": "string" }
]
```

**CI automation** — add this GitHub Actions workflow for auto-publish on tag:
```yaml
name: Publish
on:
  push:
    tags: ["v*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: "lts/*" }
      - run: npm ci && npm run build
      - run: npm publish
        env: { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }
      - name: Install mcp-publisher
        run: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
      - run: ./mcp-publisher login github-oidc
      - run: ./mcp-publisher publish
```

## Step 4: Make GitHub repos public (knowledge + chimera only)

```bash
gh repo edit Recon-Fuzz/recon-mcp-knowledge --visibility public
gh repo edit Recon-Fuzz/recon-mcp-chimera --visibility public
```

Do NOT make recon-mcp-pro public (see SECURITY_CONCERNS.md).

## Step 5: Build .mcpb bundles for Claude Desktop

`.mcpb` is the packaging standard for drag-and-drop install in Claude Desktop and Claude Code.

```bash
npx @anthropic-ai/mcpb init    # generates manifest.json
npx @anthropic-ai/mcpb pack    # creates .mcpb archive
```

Users can then install by dragging the `.mcpb` file into Claude Desktop.

## Step 6: Add MCP section to llms-full.txt on getrecon.xyz

Add this to the generated `llms-full.txt` so AI models that read Recon docs discover the tools:

```markdown
---

## MCP servers — AI tool integration

Connect AI tools directly to Recon via MCP (Model Context Protocol).

### recon-knowledge — search all Recon documentation (14 tools)

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

Tools: search_glossary, get_blog_post, get_comparison, search_site, list_tools, get_book_chapter, get_book_concept, search_book, list_book_chapters, get_substack_post, search_substack, list_substack_posts, search_all, refresh_cache. No API key needed.

### chimera-scaffold — generate Chimera fuzzing test suites (4 tools)

```json
{
  "mcpServers": {
    "chimera-scaffold": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-chimera"]
    }
  }
}
```

Tools: scaffold_project, generate_properties, get_template, explain_pattern. No API key needed.

### recon-pro — cloud fuzzing jobs (5 tools)

```json
{
  "mcpServers": {
    "recon-pro": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-pro"],
      "env": { "RECON_API_KEY": "rp_your_key_here" }
    }
  }
}
```

Tools: submit_job, get_job_status, list_jobs, get_recipes, create_recipe. Get your key at https://getrecon.xyz/settings/api.
```

## Step 7: Submit to all discovery channels

### Tier 1 (must-have)

| Channel | Action |
|---------|--------|
| npm | `npm publish --access public` (done in Step 2) |
| Official MCP Registry | `mcp-publisher publish` (done in Step 3) |
| Smithery | `smithery mcp publish "https://github.com/Recon-Fuzz/recon-mcp-knowledge" -n @recon-fuzz/mcp-knowledge` or submit at smithery.ai/new |
| Glama | Click "Add Server" at glama.ai/mcp/servers (14,000+ servers, runs vulnerability scans) |
| GitHub modelcontextprotocol/servers | PR to add entries to github.com/modelcontextprotocol/servers |

### Tier 2 (high-value)

| Channel | Action |
|---------|--------|
| PulseMCP | Submit at pulsemcp.com/servers (11,000+ servers, weekly newsletter) |
| MCP.so | Submit at mcp.so |
| MCP Market | Submit at mcpmarket.com (19,000+ servers) |
| Cursor Directory | Submit at cursor.directory/plugins |
| MCP Index | Submit at mcpindex.net |

### Tier 3 (awesome lists)

| Channel | Action |
|---------|--------|
| wong2/awesome-mcp-servers | PR to github.com/wong2/awesome-mcp-servers |
| appcypher/awesome-mcp-servers | PR to github.com/appcypher/awesome-mcp-servers |

### Tier 4 (platform-specific)

| Platform | Action |
|----------|--------|
| Claude Desktop | Submit via Google form (linked from Anthropic docs) |
| Claude Code | Submit at platform.claude.com/plugins/submit |
| Windsurf | Auto-discovers from MCP Registry |

## Step 8: Test with real clients

### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "recon-knowledge": { "command": "npx", "args": ["@recon-fuzz/mcp-knowledge"] },
    "chimera-scaffold": { "command": "npx", "args": ["@recon-fuzz/mcp-chimera"] },
    "recon-pro": { "command": "npx", "args": ["@recon-fuzz/mcp-pro"], "env": { "RECON_API_KEY": "rp_..." } }
  }
}
```

### MCP Inspector (protocol validation)
```bash
npx @modelcontextprotocol/inspector node dist/index.js
# Opens browser UI at http://localhost:6274
```

Test: "Search Recon docs for chimera", "Scaffold a vault test suite", "List my fuzzing jobs".

## Checklist

### Publish
- [ ] npm org `@recon-fuzz` exists
- [ ] `@recon-fuzz/mcp-knowledge` published to npm (public)
- [ ] `@recon-fuzz/mcp-chimera` published to npm (public)
- [ ] `@recon-fuzz/mcp-pro` published to npm (restricted)
- [ ] `server.json` created for each server
- [ ] All 3 published to Official MCP Registry
- [ ] `.mcpb` bundles built for Claude Desktop

### Visibility
- [ ] recon-mcp-knowledge repo is public
- [ ] recon-mcp-chimera repo is public
- [ ] recon-mcp-pro stays private
- [ ] MCP section added to llms-full.txt
- [ ] Listed on Smithery + Glama + PulseMCP
- [ ] PR to modelcontextprotocol/servers + awesome-mcp-servers
- [ ] Submitted to Claude Code marketplace

### Validation
- [ ] MCP Inspector passes for all 3 servers
- [ ] Tested in Claude Desktop
- [ ] Tested in Cursor
- [ ] `npm audit` clean for all 3
