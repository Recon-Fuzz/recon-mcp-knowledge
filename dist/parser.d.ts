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
    strengths: {
        a: string;
        b: string;
    };
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
    rawSections: string[];
}
export declare function parseDocument(rawText: string): ParsedContent;
