/**
 * Response formatting utilities
 * Handles formatting structured content for different MCP clients
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Check if the request is from ChatGPT based on _meta field
 * ChatGPT provides a _meta object with openai/userAgent
 * Claude does not provide a _meta object at all
 */
export function isChatGPT(meta?: Record<string, any>): boolean {
  // If _meta exists and has openai/userAgent, it's from ChatGPT
  return !!(meta && meta['openai/userAgent']);
}

/**
 * Format structured content
 */
export function formatResponse(
  structuredContent: any,
  meta?: Record<string, any>
): CallToolResult {
  // we double-up the response because of draft MCP schema

  let content = {
    type: 'text' as const,
    text: JSON.stringify(structuredContent, null, 2)
  }

  if (isChatGPT(meta)) {
    content.text = "Success"
  }

  return {
    content: [content],
    structuredContent,
  };
}

export interface PaginationInfo {
  count: number;
  perPage?: number;
  nextCursor: string | null;
  previousCursor: string | null;
}

/**
 * Pull the `pageCursor=N` query param out of a Fergus paging link.
 * Returns null when the link is null/undefined or the cursor isn't present.
 *
 * The link may be a relative path or full URL. The API has been observed
 * emitting duplicate `pageCursor` params on `previous`/`self` links (the
 * original cursor is left in place and a new one is appended). Take the
 * last occurrence, which is the effective value under normal query-string
 * "last wins" semantics.
 */
export function extractCursor(link: string | null | undefined): string | null {
  if (!link) return null;
  const queryStart = link.indexOf('?');
  if (queryStart === -1) return null;
  const params = new URLSearchParams(link.slice(queryStart + 1));
  const all = params.getAll('pageCursor');
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * Build a unified pagination object from a Fergus list response.
 * Fergus returns `{ data: [...], paging: { perPage, pageCount, links: { next, previous } } }`,
 * where `links.next` (and `links.previous`) are URLs containing `pageCursor=N`,
 * or null on the first/last page.
 */
export function extractPagination(response: any): PaginationInfo {
  const items = Array.isArray(response) ? response : (response?.data ?? []);
  const links = response?.paging?.links ?? {};
  return {
    count: response?.paging?.pageCount ?? (Array.isArray(items) ? items.length : 0),
    perPage: response?.paging?.perPage,
    nextCursor: extractCursor(links.next),
    previousCursor: extractCursor(links.previous),
  };
}

/**
 * Normalize a Fergus list response into `{ data, pagination }` for use as
 * tool output. Strips the raw `paging` field and any other top-level keys.
 */
export function normalizeListResponse<T = any>(response: any): { data: T[]; pagination: PaginationInfo } {
  const data: T[] = Array.isArray(response) ? response : (response?.data ?? []);
  return { data, pagination: extractPagination(response) };
}