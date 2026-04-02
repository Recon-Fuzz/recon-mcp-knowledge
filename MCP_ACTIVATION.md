# MCP activation guide

How to go from a private repo to a live MCP server that AI tools discover and use.

## Step 1: Claim the npm scope (one-time)

The `@recon-fuzz` scope needs to exist on npm before any package can be published under it.

```bash
# Create the npm org (needs an npm account with org creation rights)
npm org create recon-fuzz

# Add team members who should be able to publish
npm team add recon-fuzz:developers alex
npm team add recon-fuzz:developers deivitto
```

If the org already exists, skip this step.

## Step 2: Publish to npm

```bash
cd /path/to/recon-mcp-knowledge  # or chimera, or pro
npm login
npm run build
npm publish --access public      # use --access restricted for recon-mcp-pro
```

After publishing, verify it works:

```bash
npx @recon-fuzz/mcp-knowledge    # should start and wait for MCP input on stdin
```

For updates, bump the version in package.json and publish again:

```bash
npm version patch   # or minor/major
npm run build
npm publish
```

## Step 3: Make the GitHub repo public (knowledge + chimera only)

```bash
gh repo edit Recon-Fuzz/recon-mcp-knowledge --visibility public
gh repo edit Recon-Fuzz/recon-mcp-chimera --visibility public
# Do NOT make recon-mcp-pro public — it exposes API endpoint structure
```

## Step 4: Add to llms.txt on getrecon.xyz

Add an MCP server section to `llms-full.txt` so AI models that read Recon docs discover the tools automatically. This is the highest-leverage step — every AI reading your docs will know it can install and call these tools.

Example section to add:

```markdown
---

## MCP servers

AI tools can connect to Recon directly via MCP (Model Context Protocol) servers.

### recon-knowledge — search all Recon documentation

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

11 tools: search_glossary, get_blog_post, get_comparison, search_site, list_tools, get_book_chapter, get_book_concept, search_book, list_book_chapters, search_all, refresh_cache. No API key needed.

### chimera-scaffold — generate Chimera fuzzing test suites

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

4 tools: scaffold_project, generate_properties, get_template, explain_pattern. No API key needed.

### recon-pro — submit and manage cloud fuzzing jobs

```json
{
  "mcpServers": {
    "recon-pro": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-pro"],
      "env": {
        "RECON_API_KEY": "rp_your_key_here"
      }
    }
  }
}
```

5 tools: submit_job, get_job_status, list_jobs, get_recipes, create_recipe. Requires API key from https://getrecon.xyz/settings/api.
```

## Step 5: List in MCP directories

Submit to these directories so AI tools can discover the servers without reading your docs first.

### Smithery (smithery.ai)

The largest MCP server directory. Submit via their web form or CLI.

```bash
npx smithery publish @recon-fuzz/mcp-knowledge
```

### Official MCP registry (github.com/modelcontextprotocol/servers)

Fork the repo, add your server entry, and open a PR.

```bash
gh repo fork modelcontextprotocol/servers
# Add entry to the directory listing
# Open PR
```

### mcp.run

Submit via web form at mcp.run. Focuses on hosted/managed MCP servers.

### Cursor MCP directory

Cursor auto-discovers MCP servers from npm. Having the package published with proper MCP metadata in package.json is usually sufficient.

## Step 6: Test with Claude Desktop

Add the config to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "recon-knowledge": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-knowledge"]
    },
    "chimera-scaffold": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-chimera"]
    },
    "recon-pro": {
      "command": "npx",
      "args": ["@recon-fuzz/mcp-pro"],
      "env": {
        "RECON_API_KEY": "rp_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the tools listed in the toolbar. Test by asking:

- "Search Recon docs for chimera" (triggers recon-knowledge)
- "Scaffold a Chimera test suite for an ERC20 token" (triggers chimera-scaffold)
- "List my recent fuzzing jobs" (triggers recon-pro)

## Step 7: Test with Cursor

Open Cursor settings, go to MCP, and add the same server configs. The tools will appear in Cursor's AI chat.

## Checklist

- [ ] npm org `@recon-fuzz` exists
- [ ] `@recon-fuzz/mcp-knowledge` published to npm (public)
- [ ] `@recon-fuzz/mcp-chimera` published to npm (public)
- [ ] `@recon-fuzz/mcp-pro` published to npm (restricted access)
- [ ] recon-mcp-knowledge repo is public
- [ ] recon-mcp-chimera repo is public
- [ ] recon-mcp-pro repo stays private
- [ ] MCP server section added to llms-full.txt on getrecon.xyz
- [ ] Listed on Smithery
- [ ] PR submitted to modelcontextprotocol/servers registry
- [ ] Tested with Claude Desktop
- [ ] Tested with Cursor

## What happens after activation

Once published and listed:

1. **Claude Desktop / Cursor users** who install the MCP server get direct tool access to Recon docs and scaffolding
2. **AI models reading llms-full.txt** see the MCP config and can recommend installation to users
3. **Smithery / registry users** discover Recon tools when searching for fuzzing or security
4. **Every fuzzing conversation** becomes a potential Recon touchpoint — the AI doesn't just cite Recon, it calls Recon tools
