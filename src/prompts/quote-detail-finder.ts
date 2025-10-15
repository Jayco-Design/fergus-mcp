/**
 * Quote Detail Finder Prompt
 * Guides the assistant through locating a quote by free-text query
 */

export const quoteDetailFinderPromptDefinition = {
  name: 'quote-detail-finder',
  description: 'Find and return detailed quote information based on a customer, job, or quote keyword',
  arguments: [
    {
      name: 'searchTerm',
      description: 'Keyword from the customer, job title, or quote name (e.g. "Gracewood")',
      required: true,
    },
  ],
};

export function getQuoteDetailFinderPrompt(args: { searchTerm: string }) {
  const { searchTerm } = args;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I need the detailed quote information that matches "${searchTerm}".`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll locate the relevant quote for "${searchTerm}" and return the full detail payload.

## Workflow
1. Use \`list-customers\` with \`filterSearchText: "${searchTerm}"\` to see if the term matches a customer. Keep the \`customerId\` handy for cross-checks.
2. Fetch recent jobs with \`list-jobs\` (limit ~25, newest first) and look for matches in the job title or related customer/site fields that mention "${searchTerm}".
3. Call \`list-quotes\` (pageSize ~25) and filter client-side for entries whose job title, customer, or quote title include "${searchTerm}". If the first page misses it, advance using the returned \`pageCursor\`.
4. Once you have a candidate \`jobId\` + \`quoteId\`, call \`get-quote-detail\` to retrieve sections, line items, totals, and status.
5. If multiple quotes match, repeat step 4 as needed and present the best match first.

## Response Expectations
- Share a clear summary (status, quote title, job, customer) plus any totals that Fergus returns.
- Include the raw quote detail payload in a collapsible/code section so the user can inspect it.
- Note any assumptions or if the search required manual filtering.`,
        },
      },
    ],
  };
}
