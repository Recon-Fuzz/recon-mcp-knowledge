import type { ParsedContent, BlogPost, GlossaryTerm, Comparison, DevTool } from "./parser.js";

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
    if (key.includes(slug) || slug.includes(key)) {
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
    if (key.includes(slug) || slug.includes(key)) {
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
