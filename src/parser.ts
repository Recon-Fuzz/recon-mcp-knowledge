import { slugify } from "./utils.js";

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

    if (posts.has(slug)) {
      console.error(`Warning: duplicate blog slug "${slug}", overwriting previous entry`);
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
    const nlIdx = block.indexOf("\n");
    const definition = nlIdx === -1 ? "" : block.slice(nlIdx + 1).trim();

    const termKey = term.toLowerCase();
    if (glossary.has(termKey)) {
      console.error(`Warning: duplicate glossary term "${term}", overwriting previous entry`);
    }
    glossary.set(termKey, {
      term,
      definition,
    });
  }

  return glossary;
}

// Iterative section extractor — replaces ReDoS-prone regexes
const SECTION_MARKERS = ["strengths", "advantages", "pros", "conclusion", "faq", "frequently asked"] as const;

function classifyLine(line: string): string | null {
  const stripped = line.replace(/^#+\s*/, "").toLowerCase().trim();
  for (const marker of SECTION_MARKERS) {
    if (stripped.startsWith(marker)) {
      if (marker === "conclusion") return "conclusion";
      if (marker === "faq" || marker === "frequently asked") return "faq";
      return "strengths";
    }
  }
  return null;
}

function extractComparisonSections(block: string): {
  strengthsA: string; strengthsB: string; conclusion: string; faqs: string;
} {
  const lines = block.split("\n");
  let currentSection: string | null = null;
  const sections: { type: string; lines: string[] }[] = [];
  let currentLines: string[] = [];

  for (const line of lines) {
    const sectionType = classifyLine(line);
    if (sectionType) {
      if (currentSection) {
        sections.push({ type: currentSection, lines: currentLines });
      }
      currentSection = sectionType;
      currentLines = [];
    } else if (currentSection) {
      currentLines.push(line);
    }
  }
  if (currentSection) {
    sections.push({ type: currentSection, lines: currentLines });
  }

  const strengthsSections = sections.filter((s) => s.type === "strengths");
  const conclusionSection = sections.find((s) => s.type === "conclusion");
  const faqSection = sections.find((s) => s.type === "faq");

  return {
    strengthsA: strengthsSections[0]?.lines.join("\n").trim() ?? "",
    strengthsB: strengthsSections[1]?.lines.join("\n").trim() ?? "",
    conclusion: conclusionSection?.lines.join("\n").trim() ?? "",
    faqs: faqSection?.lines.join("\n").trim() ?? "",
  };
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

    // Extract strengths, conclusion, FAQs using iterative line-based parsing
    // (avoids ReDoS from complex regex with nested quantifiers on untrusted input)
    const { strengthsA, strengthsB, conclusion, faqs } = extractComparisonSections(block);

    if (comparisons.has(slug)) {
      console.error(`Warning: duplicate comparison slug "${slug}", overwriting previous entry`);
    }
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
        // Check for comparison-like content (has "vs" in #### headings)
        if (trimmed.match(/^#### /m) && trimmed.match(/ vs\.? /i)) {
          for (const [k, v] of parseComparisons(trimmed)) {
            result.comparisons.set(k, v);
          }
        }
        // Check for glossary-like content
        else if (trimmed.match(/^#### /m)) {
          for (const [k, v] of parseGlossary(trimmed)) {
            result.glossary.set(k, v);
          }
        }
        // Check for tool-like content
        if (trimmed.match(/- \*\*.+?\*\*/)) {
          result.tools.push(...parseTools(trimmed));
        }
        break;
    }
  }

  return result;
}
