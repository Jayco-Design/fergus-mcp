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

/**
 * Extract the next pagination cursor from a Fergus API list response.
 * The API returns paging as `{ paging: { links: { next: "/path?...&pageCursor=N" } } }`
 * (next is null on the last page). Returns the cursor string or null.
 */
export function extractNextCursor(response: any): string | null {
  const nextLink: string | null | undefined = response?.paging?.links?.next;
  if (!nextLink) return null;
  const match = nextLink.match(/[?&]pageCursor=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}