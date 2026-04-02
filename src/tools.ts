import type { ParsedContent, BlogPost, GlossaryTerm, Comparison, DevTool } from "./parser.js";
import type { BookContent, BookChapter, BookConcept, BookFAQ } from "./book-parser.js";
import type { SubstackContent, SubstackPost } from "./substack-parser.js";

interface SearchResult {
  type: string;
  title: string;
  snippet: string;
  score: number;
}

function scoreMatch(text: string, queryTerms: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (lower.includes(term)) {
      score++;
      // Bonus for exact word boundary matches
      const wordRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (wordRegex.test(text)) {
        score += 0.5;
      }
    }
  }
  return score;
}

function snippet(text: string, maxLen: number = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

export function searchGlossary(
  content: ParsedContent,
  query: string
): string {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return "No query provided.";

  const scored: { term: GlossaryTerm; score: number }[] = [];

  for (const [, term] of content.glossary) {
    const combinedText = `${term.term} ${term.definition}`;
    const s = scoreMatch(combinedText, queryTerms);
    if (s > 0) {
      scored.push({ term, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  if (top.length === 0) {
    return `No glossary terms found matching "${query}".`;
  }

  const lines = top.map(
    (item, i) =>
      `${i + 1}. **${item.term.term}**\n${item.term.definition}`
  );

  return `Found ${top.length} glossary term(s) for "${query}":\n\n${lines.join("\n\n")}`;
}

export function getBlogPost(
  content: ParsedContent,
  slug: string
): string {
  // Direct slug lookup
  const post = content.blogPosts.get(slug);
  if (post) {
    return formatBlogPost(post);
  }

  // Fuzzy match: check if slug is contained in any key
  for (const [key, p] of content.blogPosts) {
    if (key.includes(slug)) {
      return formatBlogPost(p);
    }
  }

  // List available slugs
  const available = Array.from(content.blogPosts.keys()).slice(0, 20);
  return `Blog post "${slug}" not found.\n\nAvailable slugs:\n${available.map((s) => `  - ${s}`).join("\n")}`;
}

function formatBlogPost(post: BlogPost): string {
  let result = `# ${post.title}\n\n`;
  result += `**Author:** ${post.author}\n`;
  result += `**Date:** ${post.date}\n`;
  if (post.url) result += `**URL:** ${post.url}\n`;

  const metaKeys = Object.keys(post.metadata).filter(
    (k) => !["Author", "Date", "URL"].includes(k)
  );
  if (metaKeys.length > 0) {
    result += "\n**Metadata:**\n";
    for (const k of metaKeys) {
      result += `  - ${k}: ${post.metadata[k]}\n`;
    }
  }

  result += `\n${post.content}`;
  return result;
}

export function getComparison(
  content: ParsedContent,
  slug: string
): string {
  // Direct lookup
  const comp = content.comparisons.get(slug);
  if (comp) {
    return formatComparison(comp);
  }

  // Fuzzy match
  for (const [key, c] of content.comparisons) {
    if (key.includes(slug)) {
      return formatComparison(c);
    }
  }

  const available = Array.from(content.comparisons.keys()).slice(0, 20);
  return `Comparison "${slug}" not found.\n\nAvailable slugs:\n${available.map((s) => `  - ${s}`).join("\n")}`;
}

function formatComparison(comp: Comparison): string {
  let result = `# ${comp.title}\n\n`;
  result += `**Entity A:** ${comp.entityA}\n`;
  result += `**Entity B:** ${comp.entityB}\n\n`;

  if (comp.strengths.a || comp.strengths.b) {
    result += `## Strengths\n`;
    if (comp.strengths.a) result += `### ${comp.entityA}\n${comp.strengths.a}\n\n`;
    if (comp.strengths.b) result += `### ${comp.entityB}\n${comp.strengths.b}\n\n`;
  }

  if (comp.conclusion) {
    result += `## Conclusion\n${comp.conclusion}\n\n`;
  }

  if (comp.faqs) {
    result += `## FAQs\n${comp.faqs}\n\n`;
  }

  result += `---\n\n## Full Content\n${comp.content}`;
  return result;
}

export function searchContent(
  content: ParsedContent,
  query: string
): string {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return "No query provided.";

  const results: SearchResult[] = [];

  // Search blog posts
  for (const [, post] of content.blogPosts) {
    const text = `${post.title} ${post.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "blog",
        title: post.title,
        snippet: snippet(post.content),
        score: s,
      });
    }
  }

  // Search glossary
  for (const [, term] of content.glossary) {
    const text = `${term.term} ${term.definition}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "glossary",
        title: term.term,
        snippet: snippet(term.definition),
        score: s,
      });
    }
  }

  // Search comparisons
  for (const [, comp] of content.comparisons) {
    const text = `${comp.title} ${comp.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "comparison",
        title: comp.title,
        snippet: snippet(comp.content),
        score: s,
      });
    }
  }

  // Search tools
  for (const tool of content.tools) {
    const text = `${tool.name} ${tool.description}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "tool",
        title: tool.name,
        snippet: `${tool.description}${tool.url ? ` (${tool.url})` : ""}`,
        score: s,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 10);

  if (top.length === 0) {
    return `No results found for "${query}".`;
  }

  const lines = top.map(
    (r, i) =>
      `${i + 1}. [${r.type.toUpperCase()}] **${r.title}** (score: ${r.score.toFixed(1)})\n   ${r.snippet}`
  );

  return `Found ${results.length} result(s) for "${query}" (showing top ${top.length}):\n\n${lines.join("\n\n")}`;
}

export function listTools(content: ParsedContent): string {
  if (content.tools.length === 0) {
    return "No developer tools found in the documentation.";
  }

  const toolList = content.tools.slice(0, 20);
  const lines = toolList.map(
    (t, i) =>
      `${i + 1}. **${t.name}**\n   ${t.description}${t.url ? `\n   URL: ${t.url}` : ""}`
  );

  return `Developer Tools (${toolList.length}):\n\n${lines.join("\n\n")}`;
}

// ─── Book documentation tools ───────────────────────────────────────────

export function getBookChapter(
  book: BookContent,
  slug: string
): string {
  // Direct lookup
  const chapter = book.chapters.get(slug);
  if (chapter) return formatBookChapter(chapter);

  // Fuzzy match
  for (const [key, ch] of book.chapters) {
    if (key.includes(slug)) {
      return formatBookChapter(ch);
    }
  }

  const available = Array.from(book.chapters.values())
    .map((ch) => `  - ${ch.slug} (${ch.category})`)
    .slice(0, 30);
  return `Chapter "${slug}" not found.\n\nAvailable chapters:\n${available.join("\n")}`;
}

function formatBookChapter(ch: BookChapter): string {
  let result = `# ${ch.title}\n\n`;
  result += `**Category:** ${ch.category}\n`;
  result += `**URL:** ${ch.url}\n\n`;
  result += ch.content;
  return result;
}

export function getBookConcept(
  book: BookContent,
  slug: string
): string {
  const concept = book.concepts.get(slug);
  if (concept) return `# ${concept.title}\n\n${concept.content}`;

  // Fuzzy match
  for (const [key, c] of book.concepts) {
    if (key.includes(slug)) {
      return `# ${c.title}\n\n${c.content}`;
    }
  }

  const available = Array.from(book.concepts.keys()).slice(0, 20);
  return `Concept "${slug}" not found.\n\nAvailable concepts:\n${available.map((s) => `  - ${s}`).join("\n")}`;
}

export function searchBook(
  book: BookContent,
  query: string
): string {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return "No query provided.";

  interface BookSearchResult {
    type: string;
    title: string;
    snippet: string;
    url: string;
    score: number;
  }

  const results: BookSearchResult[] = [];

  // Search chapters
  for (const [, ch] of book.chapters) {
    const text = `${ch.title} ${ch.category} ${ch.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "chapter",
        title: `${ch.title} (${ch.category})`,
        snippet: snippet(ch.content, 250),
        url: ch.url,
        score: s,
      });
    }
  }

  // Search concepts
  for (const [, concept] of book.concepts) {
    const text = `${concept.title} ${concept.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "concept",
        title: concept.title,
        snippet: snippet(concept.content, 250),
        url: "",
        score: s,
      });
    }
  }

  // Search FAQs
  for (const [, faq] of book.faqs) {
    const text = `${faq.question} ${faq.answer}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({
        type: "faq",
        title: faq.question,
        snippet: snippet(faq.answer, 250),
        url: "",
        score: s,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 10);

  if (top.length === 0) {
    return `No book documentation results found for "${query}".`;
  }

  const lines = top.map(
    (r, i) =>
      `${i + 1}. [${r.type.toUpperCase()}] **${r.title}** (score: ${r.score.toFixed(1)})${r.url ? `\n   URL: ${r.url}` : ""}\n   ${r.snippet}`
  );

  return `Found ${results.length} book result(s) for "${query}" (showing top ${top.length}):\n\n${lines.join("\n\n")}`;
}

export function listBookChapters(book: BookContent): string {
  if (book.chapters.size === 0) {
    return "No book chapters found. The book documentation may not be loaded yet.";
  }

  // Group by category
  const byCategory = new Map<string, BookChapter[]>();
  for (const [, ch] of book.chapters) {
    const existing = byCategory.get(ch.category) || [];
    existing.push(ch);
    byCategory.set(ch.category, existing);
  }

  const sections: string[] = [];
  for (const [category, chapters] of byCategory) {
    const lines = chapters.map(
      (ch) => `  - **${ch.title}** (slug: ${ch.slug})\n    ${ch.url}`
    );
    sections.push(`### ${category}\n${lines.join("\n")}`);
  }

  return `# Recon Book — ${book.chapters.size} chapters\n\n${sections.join("\n\n")}`;
}

// ─── Substack tools ─────────────────────────────────────────────────────

export function getSubstackPost(
  substack: SubstackContent,
  slug: string
): string {
  const post = substack.posts.get(slug);
  if (post) return formatSubstackPost(post);

  // Fuzzy match
  for (const [key, p] of substack.posts) {
    if (key.includes(slug) || slug.includes(key)) {
      return formatSubstackPost(p);
    }
  }

  const available = Array.from(substack.posts.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => `  - ${p.slug} — ${p.title} (${p.date})`)
    .slice(0, 20);
  return `Substack post "${slug}" not found.\n\nAvailable posts:\n${available.join("\n")}`;
}

function formatSubstackPost(post: SubstackPost): string {
  let result = `# ${post.title}\n\n`;
  if (post.subtitle) result += `> ${post.subtitle}\n\n`;
  result += `**Author:** ${post.author}\n`;
  result += `**Date:** ${post.date}\n`;
  result += `**URL:** ${post.url}\n`;
  result += `**Words:** ${post.wordCount}\n\n`;
  result += post.content;
  return result;
}

export function searchSubstack(
  substack: SubstackContent,
  query: string
): string {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return "No query provided.";

  const results: { post: SubstackPost; score: number }[] = [];

  for (const [, post] of substack.posts) {
    const text = `${post.title} ${post.subtitle} ${post.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ post, score: s });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 10);

  if (top.length === 0) {
    return `No substack posts found matching "${query}".`;
  }

  const lines = top.map(
    (r, i) =>
      `${i + 1}. **${r.post.title}** (${r.post.date}, score: ${r.score.toFixed(1)})\n   ${r.post.subtitle}\n   URL: ${r.post.url}\n   ${snippet(r.post.content, 200)}`
  );

  return `Found ${results.length} substack post(s) for "${query}" (showing top ${top.length}):\n\n${lines.join("\n\n")}`;
}

export function listSubstackPosts(substack: SubstackContent): string {
  if (substack.posts.size === 0) {
    return "No substack posts found.";
  }

  const sorted = Array.from(substack.posts.values())
    .sort((a, b) => b.date.localeCompare(a.date));

  const lines = sorted.map(
    (p, i) =>
      `${i + 1}. **${p.title}** (${p.date})\n   ${p.subtitle}\n   slug: ${p.slug} | ${p.wordCount} words\n   ${p.url}`
  );

  return `# Recon Substack — ${sorted.length} posts\n\n${lines.join("\n\n")}`;
}

export function searchAll(
  content: ParsedContent,
  book: BookContent,
  substack: SubstackContent,
  query: string
): string {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return "No query provided.";

  interface UnifiedResult {
    source: string;
    type: string;
    title: string;
    snippet: string;
    score: number;
  }

  const results: UnifiedResult[] = [];

  // Marketing site content
  for (const [, post] of content.blogPosts) {
    const text = `${post.title} ${post.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "site", type: "blog", title: post.title, snippet: snippet(post.content), score: s });
    }
  }

  for (const [, term] of content.glossary) {
    const text = `${term.term} ${term.definition}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "site", type: "glossary", title: term.term, snippet: snippet(term.definition), score: s });
    }
  }

  for (const [, comp] of content.comparisons) {
    const text = `${comp.title} ${comp.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "site", type: "comparison", title: comp.title, snippet: snippet(comp.content), score: s });
    }
  }

  for (const tool of content.tools) {
    const text = `${tool.name} ${tool.description}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "site", type: "tool", title: tool.name, snippet: snippet(tool.description), score: s });
    }
  }

  // Book content
  for (const [, ch] of book.chapters) {
    const text = `${ch.title} ${ch.category} ${ch.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "book", type: "chapter", title: ch.title, snippet: snippet(ch.content), score: s });
    }
  }

  for (const [, concept] of book.concepts) {
    const text = `${concept.title} ${concept.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "book", type: "concept", title: concept.title, snippet: snippet(concept.content), score: s });
    }
  }

  for (const [, faq] of book.faqs) {
    const text = `${faq.question} ${faq.answer}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "book", type: "faq", title: faq.question, snippet: snippet(faq.answer), score: s });
    }
  }

  // Substack content
  for (const [, post] of substack.posts) {
    const text = `${post.title} ${post.subtitle} ${post.content}`;
    const s = scoreMatch(text, queryTerms);
    if (s > 0) {
      results.push({ source: "substack", type: "post", title: post.title, snippet: snippet(post.content), score: s });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 15);

  if (top.length === 0) {
    return `No results found for "${query}" across all Recon content.`;
  }

  const lines = top.map(
    (r, i) =>
      `${i + 1}. [${r.source.toUpperCase()}:${r.type.toUpperCase()}] **${r.title}** (score: ${r.score.toFixed(1)})\n   ${r.snippet}`
  );

  return `Found ${results.length} result(s) for "${query}" across all sources (showing top ${top.length}):\n\n${lines.join("\n\n")}`;
}
