#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parseDocument, type ParsedContent } from "./parser.js";
import {
  searchGlossary,
  getBlogPost,
  getComparison,
  searchContent,
  listTools,
} from "./tools.js";

const DOCS_URL = "https://getrecon.xyz/llms-full.txt";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const REFRESH_MIN_INTERVAL_MS = 60 * 1000; // 60 seconds

let cachedContent: ParsedContent | null = null;
let lastFetchTime = 0;
let lastRefreshRequest = 0;

async function fetchWithRetry(
  url: string,
  retries: number = 3,
  delayMs: number = 1000
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { redirect: "error" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`);
      }
      return await response.text();
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Failed to fetch documentation after ${retries} attempts. The upstream service may be temporarily unavailable.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error("Unreachable");
}

async function getContent(): Promise<ParsedContent> {
  const now = Date.now();
  if (cachedContent && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedContent;
  }

  const rawText = await fetchWithRetry(DOCS_URL);
  cachedContent = parseDocument(rawText);
  lastFetchTime = now;

  return cachedContent;
}

async function refreshCache(): Promise<string> {
  const now = Date.now();
  if (now - lastRefreshRequest < REFRESH_MIN_INTERVAL_MS) {
    return `Cache refresh rate limited. Please wait at least 60 seconds between refreshes.`;
  }
  lastRefreshRequest = now;
  cachedContent = null;
  lastFetchTime = 0;
  await getContent();
  return "Cache refreshed successfully.";
}

const server = new Server(
  {
    name: "recon-mcp-knowledge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_glossary",
        description:
          "Search the Recon glossary for terms matching a query. Returns top 5 matching glossary terms with full definitions.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "The search query to find glossary terms",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_blog_post",
        description:
          "Get a full blog post by its slug. Returns the complete post content, metadata, and URL.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: {
              type: "string",
              description:
                "The URL slug of the blog post (e.g. 'what-is-fuzzing')",
            },
          },
          required: ["slug"],
        },
      },
      {
        name: "get_comparison",
        description:
          "Get a comparison article by slug. Returns both entities, their strengths, conclusion, and FAQs.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: {
              type: "string",
              description:
                "The URL slug of the comparison (e.g. 'echidna-vs-medusa')",
            },
          },
          required: ["slug"],
        },
      },
      {
        name: "search_content",
        description:
          "Search across all Recon content types (blog posts, glossary, comparisons, tools). Returns top 10 matches.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_tools",
        description:
          "List all developer tools documented in Recon. Returns up to 20 tools with descriptions and URLs.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "refresh_cache",
        description:
          "Force refresh the documentation cache. Fetches the latest content from getrecon.xyz.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_glossary": {
        const query = (args as { query: string }).query;
        if (!query) {
          return {
            content: [{ type: "text" as const, text: "Error: 'query' parameter is required." }],
          };
        }
        if (query.length > 1000) {
          return {
            content: [{ type: "text" as const, text: "Error: 'query' parameter exceeds maximum length of 1000 characters." }],
          };
        }
        const content = await getContent();
        const result = searchGlossary(content, query);
        return { content: [{ type: "text" as const, text: result }] };
      }

      case "get_blog_post": {
        const slug = (args as { slug: string }).slug;
        if (!slug) {
          return {
            content: [{ type: "text" as const, text: "Error: 'slug' parameter is required." }],
          };
        }
        if (slug.length > 500) {
          return {
            content: [{ type: "text" as const, text: "Error: 'slug' parameter exceeds maximum length of 500 characters." }],
          };
        }
        const content = await getContent();
        const result = getBlogPost(content, slug);
        return { content: [{ type: "text" as const, text: result }] };
      }

      case "get_comparison": {
        const slug = (args as { slug: string }).slug;
        if (!slug) {
          return {
            content: [{ type: "text" as const, text: "Error: 'slug' parameter is required." }],
          };
        }
        if (slug.length > 500) {
          return {
            content: [{ type: "text" as const, text: "Error: 'slug' parameter exceeds maximum length of 500 characters." }],
          };
        }
        const content = await getContent();
        const result = getComparison(content, slug);
        return { content: [{ type: "text" as const, text: result }] };
      }

      case "search_content": {
        const query = (args as { query: string }).query;
        if (!query) {
          return {
            content: [{ type: "text" as const, text: "Error: 'query' parameter is required." }],
          };
        }
        if (query.length > 1000) {
          return {
            content: [{ type: "text" as const, text: "Error: 'query' parameter exceeds maximum length of 1000 characters." }],
          };
        }
        const content = await getContent();
        const result = searchContent(content, query);
        return { content: [{ type: "text" as const, text: result }] };
      }

      case "list_tools": {
        const content = await getContent();
        const result = listTools(content);
        return { content: [{ type: "text" as const, text: result }] };
      }

      case "refresh_cache": {
        const result = await refreshCache();
        return { content: [{ type: "text" as const, text: result }] };
      }

      default:
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Prefetch content on startup (non-blocking)
getContent().catch((err) => {
  console.error("Failed to prefetch documentation:", err);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
