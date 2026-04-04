/**
 * Parser for book.getrecon.xyz/llms-full.txt
 *
 * The book llms-full.txt has this structure:
 *   # Title
 *   > Description
 *   ## Section (e.g. "Documentation", "Key Technical Concepts", "FAQ")
 *   ### Category (e.g. "Getting Started", "Writing Invariant Tests")
 *   - [Page Title](url): Full description paragraph
 *   ### What is X?
 *   Paragraph explanation...
 */

export interface BookChapter {
  title: string;
  slug: string;
  category: string;
  url: string;
  content: string;
}

export interface BookConcept {
  title: string;
  slug: string;
  content: string;
}

export interface BookFAQ {
  question: string;
  slug: string;
  answer: string;
}

export interface BookContent {
  chapters: Map<string, BookChapter>;
  concepts: Map<string, BookConcept>;
  faqs: Map<string, BookFAQ>;
  overview: string;
}

import { slugify } from "./utils.js";


function parseChapters(text: string): Map<string, BookChapter> {
  const chapters = new Map<string, BookChapter>();

  // Find the ## Documentation section and parse ### categories with - [Title](url): content entries
  const docMatch = text.match(/## Documentation\n([\s\S]*?)(?=\n## |$)/);
  if (!docMatch) return chapters;

  const docSection = docMatch[1];

  // Split by ### categories
  const categoryBlocks = docSection.split(/(?=^### )/m);

  for (const block of categoryBlocks) {
    const categoryMatch = block.match(/^### (.+)/m);
    if (!categoryMatch) continue;
    const category = categoryMatch[1].trim();

    // Parse each - [Title](url): content entry
    const entryRegex = /^- \[([^\]]+)\]\(([^)]+)\):\s*([\s\S]*?)(?=\n- \[|$)/gm;
    let match;
    while ((match = entryRegex.exec(block)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const content = match[3].trim();
      const slug = slugify(title);

      chapters.set(slug, { title, slug, category, url, content });
    }
  }

  return chapters;
}

function parseConcepts(text: string): Map<string, BookConcept> {
  const concepts = new Map<string, BookConcept>();

  const conceptMatch = text.match(/## Key Technical Concepts\n([\s\S]*?)(?=\n## |$)/);
  if (!conceptMatch) return concepts;

  const conceptSection = conceptMatch[1];
  const conceptBlocks = conceptSection.split(/(?=^### )/m);

  for (const block of conceptBlocks) {
    const titleMatch = block.match(/^### (.+)/m);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const content = block.slice(block.indexOf("\n") + 1).trim();
    const slug = slugify(title);

    concepts.set(slug, { title, slug, content });
  }

  return concepts;
}

function parseFAQs(text: string): Map<string, BookFAQ> {
  const faqs = new Map<string, BookFAQ>();

  const faqMatch = text.match(/## Frequently Asked Questions\n([\s\S]*?)(?=\n## |$)/);
  if (!faqMatch) return faqs;

  const faqSection = faqMatch[1];
  const faqBlocks = faqSection.split(/(?=^### )/m);

  for (const block of faqBlocks) {
    const questionMatch = block.match(/^### (.+)/m);
    if (!questionMatch) continue;

    const question = questionMatch[1].trim();
    const answer = block.slice(block.indexOf("\n") + 1).trim();
    const slug = slugify(question);

    faqs.set(slug, { question, slug, answer });
  }

  return faqs;
}

function parseOverview(text: string): string {
  // Everything before ## Documentation
  const overviewMatch = text.match(/^([\s\S]*?)(?=\n## Documentation)/m);
  return overviewMatch ? overviewMatch[1].trim() : "";
}

export function parseBookDocument(rawText: string): BookContent {
  return {
    chapters: parseChapters(rawText),
    concepts: parseConcepts(rawText),
    faqs: parseFAQs(rawText),
    overview: parseOverview(rawText),
  };
}
