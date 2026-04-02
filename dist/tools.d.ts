import type { ParsedContent } from "./parser.js";
export declare function searchGlossary(content: ParsedContent, query: string): string;
export declare function getBlogPost(content: ParsedContent, slug: string): string;
export declare function getComparison(content: ParsedContent, slug: string): string;
export declare function searchContent(content: ParsedContent, query: string): string;
export declare function listTools(content: ParsedContent): string;
