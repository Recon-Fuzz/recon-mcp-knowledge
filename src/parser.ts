export interface BlogPost {
  title: string;
  slug: string;
  author: string;
  date: string;
  url: string;
  content: string;
  metadata: Record<string, string>;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface Comparison {
  title: string;
  slug: string;
  entityA: string;
  entityB: string;
  content: string;
  strengths: { a: string; b: string };
  conclusion: string;
  faqs: string;
}

export interface DevTool {
  name: string;
  description: string;
  url: string;
}

export interface ParsedContent {
  blogPosts: Map<string, BlogPost>;
  glossary: Map<string, GlossaryTerm>;
  comparisons: Map<string, Comparison>;
  tools: DevTool[];
}

// Re-export for convenience
export type { BookContent, BookChapter, BookConcept, BookFAQ } from "./book-parser.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseBlogPosts(section: string): Map<string, BlogPost> {
  const posts = new Map<string, BlogPost>();
  // Split on ### headings that represent individual posts
  const postBlocks = section.split(/(?=^### )/m);

  for (const block of postBlocks) {
    const titleMatch = block.match(/^### (.+)/m);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const slug = slugify(title);

    const authorMatch = block.match(/\*\*Author:\*\*\s*(.+)/i);
    const dateMatch = block.match(/\*\*Date:\*\*\s*(.+)/i);
    const urlMatch = block.match(/\*\*URL:\*\*\s*(.+)/i);

    const metadata: Record<string, string> = {};
    const metaRegex = /\*\*(\w[\w\s]*):\*\*\s*(.+)/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(block)) !== null) {
      metadata[metaMatch[1].trim()] = metaMatch[2].trim();
    }

    posts.set(slug, {
      title,
      slug,
      author: authorMatch?.[1]?.trim() ?? "Unknown",
      date: dateMatch?.[1]?.trim() ?? "Unknown",
      url: urlMatch?.[1]?.trim() ?? "",
      content: block.trim(),
      metadata,
    });
  }

  return posts;
}

function parseGlossary(section: string): Map<string, GlossaryTerm> {
  const glossary = new Map<string, GlossaryTerm>();
  const termBlocks = section.split(/(?=^#### )/m);

  for (const block of termBlocks) {
    const termMatch = block.match(/^#### (.+)/m);
    if (!termMatch) continue;

    const term = termMatch[1].trim();
    const definition = block
      .slice(block.indexOf("\n") + 1)
      .trim();

    glossary.set(term.toLowerCase(), {
      term,
      definition,
    });
  }

  return glossary;
}

function parseComparisons(section: string): Map<string, Comparison> {
  const comparisons = new Map<string, Comparison>();
  const compBlocks = section.split(/(?=^#### )/m);

  for (const block of compBlocks) {
    const titleMatch = block.match(/^#### (.+)/m);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const slug = slugify(title);

    // Try to extract "X vs Y" pattern using indexOf to avoid ReDoS
    let entityA = title;
    let entityB = "";
    const vsIdx = title.search(/\svs\.?\s/i);
    if (vsIdx >= 0) {
      const vsMatch = title.match(/\s(vs\.?)\s/i);
      entityA = title.slice(0, vsIdx).trim();
      entityB = title.slice(vsIdx + (vsMatch ? vsMatch[0].length : 4)).trim();
    }

    // Extract strengths sections for both entities
    const strengthsRegex = /(?:#+\s*)?(?:strengths?|advantages?|pros?)\s+(?:of\s+)?(.+?)[\s:]*\n([\s\S]*?)(?=(?:#+\s*)?(?:strengths?|advantages?|pros?|conclusion|faqs?)|$)/gi;
    let strengthsA = "";
    let strengthsB = "";
    let strengthMatch;
    let strengthIdx = 0;
    while ((strengthMatch = strengthsRegex.exec(block)) !== null) {
      if (strengthIdx === 0) {
        strengthsA = strengthMatch[2]?.trim() ?? "";
      } else if (strengthIdx === 1) {
        strengthsB = strengthMatch[2]?.trim() ?? "";
      }
      strengthIdx++;
    }
    // Fallback: try a simpler split if regex didn't find two sections
    if (strengthsA && !strengthsB && entityB) {
      const strengthSections = block.split(/(?:#+\s*)?(?:strengths?|advantages?|pros?)\s+(?:of\s+)?/i);
      if (strengthSections.length >= 3) {
        const sectionB = strengthSections[2];
        const endMatch = sectionB.search(/(?:#+\s*)?(?:conclusion|faqs?)/i);
        strengthsB = (endMatch >= 0 ? sectionB.slice(0, endMatch) : sectionB).trim();
      }
    }

    // Extract conclusion
    const conclusionMatch = block.match(
      /(?:^|\n)(?:#+\s*)?conclusion[:\s]*\n([\s\S]*?)(?=(?:^|\n)(?:#+\s*)?(?:faq|$))/im
    );
    const conclusion = conclusionMatch?.[1]?.trim() ?? "";

    // Extract FAQs
    const faqMatch = block.match(
      /(?:^|\n)(?:#+\s*)?(?:faqs?|frequently asked)[:\s]*\n([\s\S]*?)$/im
    );
    const faqs = faqMatch?.[1]?.trim() ?? "";

    comparisons.set(slug, {
      title,
      slug,
      entityA,
      entityB,
      content: block.trim(),
      strengths: { a: strengthsA, b: strengthsB },
      conclusion,
      faqs,
    });
  }

  return comparisons;
}

function parseTools(section: string): DevTool[] {
  const tools: DevTool[] = [];
  const toolRegex = /- \*\*(.+?)\*\*[:\s]*(.+)/g;
  let match;

  while ((match = toolRegex.exec(section)) !== null) {
    const name = match[1].trim();
    const rest = match[2].trim();

    // Try to extract URL from the description
    const urlMatch = rest.match(/(https?:\/\/[^\s)]+)/);
    const url = urlMatch?.[1] ?? "";
    const description = rest.replace(/(https?:\/\/[^\s)]+)/g, "").replace(/[()]/g, "").trim();

    tools.push({ name, description, url });
  }

  return tools;
}

function identifySection(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("glossary")) return "glossary";
  if (lower.includes("comparison") || lower.includes(" vs ") || lower.includes(" vs.")) return "comparisons";
  if (lower.includes("developer tool") || lower.includes("dev tool")) return "tools";
  if (lower.includes("blog") || lower.match(/\*\*author:\*\*/i)) return "blog";
  return "unknown";
}

export function parseDocument(rawText: string): ParsedContent {
  // Split by --- dividers (3 or more dashes on their own line)
  const sections = rawText.split(/\n-{3,}\n/);

  const result: ParsedContent = {
    blogPosts: new Map(),
    glossary: new Map(),
    comparisons: new Map(),
    tools: [],
  };

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const type = identifySection(trimmed);

    switch (type) {
      case "blog":
        for (const [k, v] of parseBlogPosts(trimmed)) {
          result.blogPosts.set(k, v);
        }
        break;
      case "glossary":
        for (const [k, v] of parseGlossary(trimmed)) {
          result.glossary.set(k, v);
        }
        break;
      case "comparisons":
        for (const [k, v] of parseComparisons(trimmed)) {
          result.comparisons.set(k, v);
        }
        break;
      case "tools":
        result.tools.push(...parseTools(trimmed));
        break;
      default:
        // Try all parsers on unknown sections
        // Check if it has blog-like content
        if (trimmed.match(/^### /m) && trimmed.match(/\*\*Author:\*\*/i)) {
          for (const [k, v] of parseBlogPosts(trimmed)) {
            result.blogPosts.set(k, v);
          }
        }
        // Check for glossary-like content
        if (trimmed.match(/^#### /m) && !trimmed.match(/ vs\.? /i)) {
          for (const [k, v] of parseGlossary(trimmed)) {
            result.glossary.set(k, v);
          }
        }
        break;
    }
  }

  return result;
}
