/**
 * Job Progress Snapshot Prompt
 * Provides a structured briefing for a job including status, quotes, and recent activity.
 */

export const jobProgressSnapshotPromptDefinition = {
  name: 'job-progress-snapshot',
  description: 'Summarize the current state of a job, including quotes and recent time entries',
  arguments: [
    {
      name: 'jobRef',
      description: 'Job identifier or keyword (job ID, title fragment, customer/site name)',
      required: true,
    },
  ],
};

export function getJobProgressSnapshotPrompt(args: { jobRef: string }) {
  const { jobRef } = args;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Give me a progress update for "${jobRef}".`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll assemble a progress snapshot for "${jobRef}".

## Workflow
1. Determine the job:
   - If "${jobRef}" is numeric, try \`manage-jobs\` with action \`get\` directly.
   - Otherwise run \`manage-jobs\` with action \`list\` (\`pageSize\` ≈ 50, \`sortOrder: "desc"\`) and match on title, customer, or site names containing "${jobRef}".
2. Once you have the job, capture its status, stage, assigned staff, customer, site, and key dates.
3. Gather financial context:
   - Call \`manage-quotes\` with action \`list\` using the \`jobId\` to find associated quotes.
   - For the most relevant quote (typically the latest or Accepted), fetch detail via \`manage-quotes\` with action \`get-detail\` to surface totals and sections.
   - Call \`manage-jobs\` with action \`get-financial-summary\` for the overall job financial picture.
   - For multi-phase jobs, use \`manage-jobs\` action \`get-phase-financial-summary\` for each phase to show per-phase cost breakdowns.
4. Check delivery activity:
   - Use \`manage-time-entries\` with action \`list\` limited to the last 14 days and filter for the job number/reference to highlight recent work and who logged it.
5. If the job has outstanding tasks or status blockers surfaced in the payloads, call \`manage-jobs\` with action \`get\` again to verify current status just before summarizing.

## Output Expectations
- Lead with a plain-language summary: job status, key dates, primary quote value, and notable recent time entry activity.
- Provide bullet subsections for Job Details, Quotes, Recent Activity, and Next Actions.
- Include raw excerpts (JSON code blocks) for the job detail and the primary quote so the operator can inspect fields without rerunning tools.
- Note any gaps (e.g., no quotes found, no time entries in window) and suggest follow-up steps if data is missing.
`,
        },
      },
    ],
  };
}
