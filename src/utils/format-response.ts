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