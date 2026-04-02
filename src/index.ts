#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parseDocument, type ParsedContent } from "./parser.js";
import { parseBookDocument, type BookContent } from "./book-parser.js";
import { fetchSubstackContent, type SubstackContent } from "./substack-parser.js";
import {
  searchGlossary,
  getBlogPost,
  getComparison,
  searchContent,
  listTools,
  getBookChapter,
  getBookConcept,
  searchBook,
  listBookChapters,
  getSubstackPost,
  searchSubstack,
  listSubstackPosts,
  searchAll,
} from "./tools.js";

// ─── Sources ────────────────────────────────────────────────────────────
const SITE_URL = "https://getrecon.xyz/llms-full.txt";
const BOOK_URL = "https://book.getrecon.xyz/llms-full.txt";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const REFRESH_MIN_INTERVAL_MS = 60 * 1000; // 60 seconds

// ─── Cache state ────────────────────────────────────────────────────────
let cachedSiteContent: ParsedContent | null = null;
let cachedBookContent: BookContent | null = null;
let cachedSubstackContent: SubstackContent | null = null;
let lastSiteFetch = 0;
let lastBookFetch = 0;
let lastSubstackFetch = 0;
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
      const contentLength = parseInt(response.headers.get("content-length") || "0");
      if (contentLength > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`);
      }
      return await response.text();
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Failed to fetch ${url} after ${retries} attempts. The upstream service may be temporarily unavailable.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error("Unreachable");
}

async function getSiteContent(): Promise<ParsedContent> {
  const now = Date.now();
  if (cachedSiteContent && now - lastSiteFetch < CACHE_TTL_MS) {
    return cachedSiteContent;
  }
  const rawText = await fetchWithRetry(SITE_URL);
  cachedSiteContent = parseDocument(rawText);
  lastSiteFetch = now;
  return cachedSiteContent;
}

async function getBookContent(): Promise<BookContent> {
  const now = Date.now();
  if (cachedBookContent && now - lastBookFetch < CACHE_TTL_MS) {
    return cachedBookContent;
  }
  try {
    const rawText = await fetchWithRetry(BOOK_URL);
    cachedBookContent = parseBookDocument(rawText);
    lastBookFetch = now;
  } catch {
    // Book URL may not be deployed yet — return empty content
    if (!cachedBookContent) {
      cachedBookContent = { chapters: new Map(), concepts: new Map(), faqs: new Map(), overview: "" };
    }
  }
  return cachedBookContent;
}

async function getSubstackContent(): Promise<SubstackContent> {
  const now = Date.now();
  if (cachedSubstackContent && now - lastSubstackFetch < CACHE_TTL_MS) {
    return cachedSubstackContent;
  }
  try {
    cachedSubstackContent = await fetchSubstackContent();
    lastSubstackFetch = now;
  } catch {
    if (!cachedSubstackContent) {
      cachedSubstackContent = { posts: new Map() };
    }
  }
  return cachedSubstackContent;
}

async function refreshCache(): Promise<string> {
  const now = Date.now();
  if (now - lastRefreshRequest < REFRESH_MIN_INTERVAL_MS) {
    return "Cache refresh rate limited. Please wait at least 60 seconds between refreshes.";
  }
  lastRefreshRequest = now;
  cachedSiteContent = null;
  cachedBookContent = null;
  cachedSubstackContent = null;
  lastSiteFetch = 0;
  lastBookFetch = 0;
  lastSubstackFetch = 0;

  const results: string[] = [];
  try {
    await getSiteContent();
    results.push("Site content refreshed.");
  } catch (err) {
    results.push(`Site content failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    await getBookContent();
    results.push("Book content refreshed.");
  } catch (err) {
    results.push(`Book content failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const sub = await getSubstackContent();
    results.push(`Substack refreshed (${sub.posts.size} posts).`);
  } catch (err) {
    results.push(`Substack failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return results.join(" ");
}

// ─── Validate string param ─────────────────────────────────────────────
function validateString(value: unknown, name: string, maxLen: number = 1000): string | null {
  if (!value || typeof value !== "string") return `Error: '${name}' parameter is required.`;
  if (value.length > maxLen) return `Error: '${name}' exceeds maximum length of ${maxLen} characters.`;
  return null;
}

// ─── Server ─────────────────────────────────────────────────────────────
const server = new Server(
  { name: "recon-mcp-knowledge", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Site tools (getrecon.xyz) ──────────────────────────────────
    {
      name: "search_glossary",
      description: "Search the Recon glossary for terms matching a query. Returns top 5 matching glossary terms with full definitions. Source: getrecon.xyz",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "The search query to find glossary terms" } },
        required: ["query"],
      },
    },
    {
      name: "get_blog_post",
      description: "Get a full blog post by its slug. Returns the complete post content, metadata, and URL. Source: getrecon.xyz",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "The URL slug of the blog post (e.g. 'what-is-fuzzing')" } },
        required: ["slug"],
      },
    },
    {
      name: "get_comparison",
      description: "Get a comparison article by slug. Returns both entities, their strengths, conclusion, and FAQs. Source: getrecon.xyz",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "The URL slug of the comparison (e.g. 'echidna-vs-medusa')" } },
        required: ["slug"],
      },
    },
    {
      name: "search_site",
      description: "Search across getrecon.xyz content (blog posts, glossary, comparisons, tools). Returns top 10 matches.",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
    {
      name: "list_tools",
      description: "List all developer tools documented on getrecon.xyz. Returns up to 20 tools with descriptions and URLs.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    // ── Book tools (book.getrecon.xyz) ─────────────────────────────
    {
      name: "get_book_chapter",
      description: "Get a book documentation chapter by slug. Returns the full chapter content, category, and URL. Source: book.getrecon.xyz. Covers: Chimera framework, invariant testing, bootcamp, Recon Pro, tools, OSS repos.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "The chapter slug (e.g. 'chimera-framework', 'example-project', 'running-jobs')" } },
        required: ["slug"],
      },
    },
    {
      name: "get_book_concept",
      description: "Get a technical concept explanation from the Recon Book. Covers: invariant testing, Chimera, stateful fuzzing, handlers, ghost variables, clamping, optimization mode, dynamic replacement, governance fuzzing, Recon Magic.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "The concept slug (e.g. 'what-is-invariant-testing', 'what-is-clamping', 'what-is-optimization-mode')" } },
        required: ["slug"],
      },
    },
    {
      name: "search_book",
      description: "Search across Recon Book documentation (chapters, concepts, FAQs). Returns top 10 matches. Source: book.getrecon.xyz",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
    {
      name: "list_book_chapters",
      description: "List all chapters in the Recon Book, grouped by category (Getting Started, Writing Invariant Tests, Bootcamp, Using Recon Pro, Free Tools, OSS, Reference).",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    // ── Substack tools (getrecon.substack.com) ──────────────────────
    {
      name: "get_substack_post",
      description: "Get a full Substack post by slug. Returns title, author, date, and full article content. Source: getrecon.substack.com (36 posts on invariant testing, fuzzing, engagement retrospectives, product updates).",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "The post slug (e.g. 'introducing-recon-magic', 'the-bug-that-was-missed', 'ebtc-retrospective')" } },
        required: ["slug"],
      },
    },
    {
      name: "search_substack",
      description: "Search across all Recon Substack posts. Returns top 10 matches with titles, dates, and content snippets.",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
    {
      name: "list_substack_posts",
      description: "List all Recon Substack newsletter posts sorted by date. Shows title, subtitle, date, word count, and slug for each post.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    // ── Cross-source tools ─────────────────────────────────────────
    {
      name: "search_all",
      description: "Search across ALL Recon content — getrecon.xyz (blog, glossary, comparisons, tools), book.getrecon.xyz (chapters, concepts, FAQs), and getrecon.substack.com (newsletter posts). Returns top 15 matches with source labels.",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
    {
      name: "refresh_cache",
      description: "Force refresh the documentation cache from all three sources (getrecon.xyz, book.getrecon.xyz, getrecon.substack.com). Rate limited to once per 60 seconds.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Site tools ──────────────────────────────────────────────
      case "search_glossary": {
        const err = validateString((args as Record<string, unknown>).query, "query");
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const content = await getSiteContent();
        return { content: [{ type: "text" as const, text: searchGlossary(content, (args as { query: string }).query) }] };
      }

      case "get_blog_post": {
        const err = validateString((args as Record<string, unknown>).slug, "slug", 500);
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const content = await getSiteContent();
        return { content: [{ type: "text" as const, text: getBlogPost(content, (args as { slug: string }).slug) }] };
      }

      case "get_comparison": {
        const err = validateString((args as Record<string, unknown>).slug, "slug", 500);
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const content = await getSiteContent();
        return { content: [{ type: "text" as const, text: getComparison(content, (args as { slug: string }).slug) }] };
      }

      case "search_site":
      case "search_content": {
        const err = validateString((args as Record<string, unknown>).query, "query");
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const content = await getSiteContent();
        return { content: [{ type: "text" as const, text: searchContent(content, (args as { query: string }).query) }] };
      }

      case "list_tools": {
        const content = await getSiteContent();
        return { content: [{ type: "text" as const, text: listTools(content) }] };
      }

      // ── Book tools ──────────────────────────────────────────────
      case "get_book_chapter": {
        const err = validateString((args as Record<string, unknown>).slug, "slug", 500);
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const book = await getBookContent();
        return { content: [{ type: "text" as const, text: getBookChapter(book, (args as { slug: string }).slug) }] };
      }

      case "get_book_concept": {
        const err = validateString((args as Record<string, unknown>).slug, "slug", 500);
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const book = await getBookContent();
        return { content: [{ type: "text" as const, text: getBookConcept(book, (args as { slug: string }).slug) }] };
      }

      case "search_book": {
        const err = validateString((args as Record<string, unknown>).query, "query");
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const book = await getBookContent();
        return { content: [{ type: "text" as const, text: searchBook(book, (args as { query: string }).query) }] };
      }

      case "list_book_chapters": {
        const book = await getBookContent();
        return { content: [{ type: "text" as const, text: listBookChapters(book) }] };
      }

      // ── Substack tools ─────────────────────────────────────────
      case "get_substack_post": {
        const err = validateString((args as Record<string, unknown>).slug, "slug", 500);
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const substack = await getSubstackContent();
        return { content: [{ type: "text" as const, text: getSubstackPost(substack, (args as { slug: string }).slug) }] };
      }

      case "search_substack": {
        const err = validateString((args as Record<string, unknown>).query, "query");
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const substack = await getSubstackContent();
        return { content: [{ type: "text" as const, text: searchSubstack(substack, (args as { query: string }).query) }] };
      }

      case "list_substack_posts": {
        const substack = await getSubstackContent();
        return { content: [{ type: "text" as const, text: listSubstackPosts(substack) }] };
      }

      // ── Cross-source ────────────────────────────────────────────
      case "search_all": {
        const err = validateString((args as Record<string, unknown>).query, "query");
        if (err) return { content: [{ type: "text" as const, text: err }] };
        const [content, book, substack] = await Promise.all([getSiteContent(), getBookContent(), getSubstackContent()]);
        return { content: [{ type: "text" as const, text: searchAll(content, book, substack, (args as { query: string }).query) }] };
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

// Prefetch all sources on startup (non-blocking)
Promise.all([
  getSiteContent().catch(() => console.error("Failed to prefetch site content")),
  getBookContent().catch(() => console.error("Failed to prefetch book content")),
  getSubstackContent().catch(() => console.error("Failed to prefetch substack content")),
]);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  console.error("Fatal error starting server");
  process.exit(1);
});
