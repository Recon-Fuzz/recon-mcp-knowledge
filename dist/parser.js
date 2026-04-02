function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
}
function parseBlogPosts(section) {
    const posts = new Map();
    // Split on ### headings that represent individual posts
    const postBlocks = section.split(/(?=^### )/m);
    for (const block of postBlocks) {
        const titleMatch = block.match(/^### (.+)/m);
        if (!titleMatch)
            continue;
        const title = titleMatch[1].trim();
        const slug = slugify(title);
        const authorMatch = block.match(/\*\*Author:\*\*\s*(.+)/i);
        const dateMatch = block.match(/\*\*Date:\*\*\s*(.+)/i);
        const urlMatch = block.match(/\*\*URL:\*\*\s*(.+)/i);
        const metadata = {};
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
function parseGlossary(section) {
    const glossary = new Map();
    const termBlocks = section.split(/(?=^#### )/m);
    for (const block of termBlocks) {
        const termMatch = block.match(/^#### (.+)/m);
        if (!termMatch)
            continue;
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
function parseComparisons(section) {
    const comparisons = new Map();
    const compBlocks = section.split(/(?=^#### )/m);
    for (const block of compBlocks) {
        const titleMatch = block.match(/^#### (.+)/m);
        if (!titleMatch)
            continue;
        const title = titleMatch[1].trim();
        const slug = slugify(title);
        // Try to extract "X vs Y" pattern
        const vsMatch = title.match(/(.+?)\s+vs\.?\s+(.+)/i);
        const entityA = vsMatch?.[1]?.trim() ?? title;
        const entityB = vsMatch?.[2]?.trim() ?? "";
        // Extract strengths sections
        const strengthsAMatch = block.match(/(?:strengths?|advantages?|pros?)\s+(?:of\s+)?(?:.*?)(?=strengths?|advantages?|pros?|conclusion|faqs?|$)/is);
        const strengthsA = strengthsAMatch?.[0]?.trim() ?? "";
        const strengthsB = "";
        // Extract conclusion
        const conclusionMatch = block.match(/(?:^|\n)(?:#+\s*)?conclusion[:\s]*\n([\s\S]*?)(?=(?:^|\n)(?:#+\s*)?(?:faq|$))/im);
        const conclusion = conclusionMatch?.[1]?.trim() ?? "";
        // Extract FAQs
        const faqMatch = block.match(/(?:^|\n)(?:#+\s*)?(?:faqs?|frequently asked)[:\s]*\n([\s\S]*?)$/im);
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
function parseTools(section) {
    const tools = [];
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
function identifySection(text) {
    const lower = text.toLowerCase();
    if (lower.includes("glossary"))
        return "glossary";
    if (lower.includes("comparison") || lower.includes(" vs ") || lower.includes(" vs."))
        return "comparisons";
    if (lower.includes("developer tool") || lower.includes("dev tool"))
        return "tools";
    if (lower.includes("blog") || lower.match(/\*\*author:\*\*/i))
        return "blog";
    return "unknown";
}
export function parseDocument(rawText) {
    // Split by --- dividers (3 or more dashes on their own line)
    const sections = rawText.split(/\n-{3,}\n/);
    const result = {
        blogPosts: new Map(),
        glossary: new Map(),
        comparisons: new Map(),
        tools: [],
        rawSections: sections,
    };
    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed)
            continue;
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
//# sourceMappingURL=parser.js.map