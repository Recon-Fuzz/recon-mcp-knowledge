/**
 * Parser for getrecon.substack.com
 *
 * Uses the Substack API:
 *   - List:  /api/v1/posts?offset=N&limit=M
 *   - Single: /api/v1/posts/{slug}  (returns full HTML body)
 *
 * We fetch the list for metadata, then strip HTML from body_html for content.
 */

export interface SubstackPost {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  date: string;
  author: string;
  url: string;
  content: string;       // plain text (HTML stripped)
  wordCount: number;
}

export interface SubstackContent {
  posts: Map<string, SubstackPost>;
}

const SUBSTACK_BASE = "https://getrecon.substack.com";
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

function stripHtml(html: string): string {
  return html
    // Remove script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Convert common block elements to newlines
    .replace(/<\/?(p|div|br|h[1-6]|li|blockquote|pre|tr)[^>]*>/gi, "\n")
    // Convert links to markdown-style
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    // Convert bold/strong
    .replace(/<\/?(?:b|strong)[^>]*>/gi, "**")
    // Convert italic/em
    .replace(/<\/?(?:i|em)[^>]*>/gi, "*")
    // Convert code
    .replace(/<\/?code[^>]*>/gi, "`")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface SubstackApiPost {
  id: number;
  title: string;
  slug: string;
  subtitle?: string;
  post_date: string;
  canonical_url: string;
  body_html?: string;
  publishedBylines?: Array<{ name: string }>;
  wordcount?: number;
}

async function fetchJson(url: string, retries = 3): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const contentLength = parseInt(response.headers.get("content-length") || "0");
      if (contentLength > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large: ${contentLength} bytes`);
      }
      return await response.json();
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Failed to fetch ${url} after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error("Unreachable");
}

export async function fetchSubstackContent(): Promise<SubstackContent> {
  const posts = new Map<string, SubstackPost>();
  let offset = 0;
  const limit = 12;

  // Paginate through all posts
  while (true) {
    const url = `${SUBSTACK_BASE}/api/v1/posts?offset=${offset}&limit=${limit}`;
    const data = await fetchJson(url) as SubstackApiPost[];

    if (!Array.isArray(data) || data.length === 0) break;

    for (const post of data) {
      const content = post.body_html ? stripHtml(post.body_html) : "";
      const author = post.publishedBylines?.[0]?.name ?? "Recon";

      posts.set(post.slug, {
        id: post.id,
        title: post.title ?? "",
        slug: post.slug ?? "",
        subtitle: post.subtitle ?? "",
        date: post.post_date ? post.post_date.split("T")[0] : "",
        author,
        url: post.canonical_url ?? `${SUBSTACK_BASE}/p/${post.slug}`,
        content,
        wordCount: post.wordcount ?? content.split(/\s+/).length,
      });
    }

    offset += data.length;

    // Safety limit
    if (offset > 200) break;
  }

  return { posts };
}
