/**
 * Response formatting utilities
 * Handles formatting structured content for different MCP clients
 */

export interface FormattedResponse {
  content?: Array<{ type: 'text'; text: string }>;
  structuredContent?: any;
  [key: string]: unknown; // Allow additional properties for MCP compatibility
}

/**
 * Check if the request is from ChatGPT based on _meta field
 */
export function isChatGPT(meta?: Record<string, any>): boolean {
  if (!meta || !meta['openai/userAgent']) return false;
  const userAgent = meta['openai/userAgent'];
  return typeof userAgent === 'string' && userAgent.toLowerCase().includes('chatgpt');
}

/**
 * Format structured content based on the client type
 * - ChatGPT: returns structuredContent only (for template rendering)
 * - Claude: returns text representation in content array
 */
export function formatResponse(
  structuredContent: any,
  meta?: Record<string, any>
): FormattedResponse {
  if (isChatGPT(meta)) {
    // ChatGPT mode - return structured content only for template rendering
    return { structuredContent };
  }

  // MCP mode (Claude) - return as JSON in content array
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
  };
}