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
  let text = html;

  // 1. Remove script/style blocks first (before any entity decoding)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 2. Decode HTML entities BEFORE stripping tags
  //    (prevents double-encoded entities like &amp;lt;script&amp;gt; from surviving tag removal)
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // 3. Second pass: remove any tags that emerged from entity decoding
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 4. Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|blockquote|pre|tr)[^>]*>/gi, "\n");

  // 5. Convert links — filter out javascript: URIs
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, linkText: string) => {
    if (/^\s*javascript\s*:/i.test(href)) return linkText;
    if (/^\s*data\s*:/i.test(href)) return linkText;
    if (/^\s*vbscript\s*:/i.test(href)) return linkText;
    return `[${linkText}](${href})`;
  });

  // 6. Convert inline formatting
  text = text.replace(/<\/?(?:b|strong)[^>]*>/gi, "**");
  text = text.replace(/<\/?(?:i|em)[^>]*>/gi, "*");
  text = text.replace(/<\/?code[^>]*>/gi, "`");

  // 7. Strip ALL remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // 8. Clean up whitespace
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
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

// Read response body with streaming byte limit (prevents OOM on chunked responses)
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = parseInt(response.headers.get("content-length") || "0");
  if (contentLength > maxBytes) {
    throw new Error(`Response too large: ${contentLength} bytes (max ${maxBytes})`);
  }

  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new Error(`Response exceeded ${maxBytes} byte limit during streaming`);
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
}

async function fetchJson(url: string, retries = 3): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const text = await readBodyWithLimit(response, MAX_RESPONSE_SIZE);
      return JSON.parse(text);
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Failed to fetch after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`
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
