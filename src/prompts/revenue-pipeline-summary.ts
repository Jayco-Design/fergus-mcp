/**
 * Revenue Pipeline Summary Prompt
 * Rolls up quote pipeline metrics over a configurable period.
 */

export const revenuePipelineSummaryPromptDefinition = {
  name: 'revenue-pipeline-summary',
  description: 'Summarize quote pipeline value by status for a given date range',
  arguments: [
    {
      name: 'dateFrom',
      description: 'Start date (ISO 8601). Defaults to start of current month when omitted.',
      required: false,
    },
    {
      name: 'dateTo',
      description: 'End date (ISO 8601). Defaults to today when omitted.',
      required: false,
    },
  ],
};

export function getRevenuePipelineSummaryPrompt(args: { dateFrom?: string; dateTo?: string }) {
  const { dateFrom, dateTo } = args;
  const rangeText = dateFrom || dateTo ? `from ${dateFrom ?? 'start'} to ${dateTo ?? 'today'}` : 'for the current month-to-date';

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Give me a revenue pipeline summary ${rangeText}.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll build a revenue pipeline overview ${rangeText}.

## Workflow
1. Fetch quotes with \`list-quotes\`:
   - Use \`createdAfter\` / \`modifiedAfter\` filters when dates are supplied.
   - Page through results until you cover the period (watch \`pageCursor\`).
2. Group quotes by status (Draft, Sent, Accepted, Rejected, etc.) and sum their total amounts. Prefer the \`grandTotal\`/financial fields from the payload.
3. Identify top opportunities:
   - Highlight the highest-value quotes still in Draft/Sent.
   - Note accepted quotes within range for revenue recognition.
4. Cross-reference customers/jobs for context by calling \`get-job\` or \`get-customer\` when a quote stands out (> configurable threshold such as \$10k) so you can mention the client and job name in the summary.
5. Surface any quotes approaching expiry (compare due dates vs today) and recommend next actions.

## Output Expectations
- Provide a headline metrics table: total value by status, counts, and conversion rate (Accepted / Sent).
- List top three open opportunities with customer, job, amount, current status, and due date.
- Call out accepted quotes (won revenue) and note next steps for finance/operations.
- Attach a JSON block with the aggregated metrics and the raw IDs of highlighted quotes for audit trails.
- Mention data limitations (e.g., partial pagination, missing totals) if encountered.
`,
        },
      },
    ],
  };
}
