/**
 * Team Timesheet Summary Prompt
 * Analyzes time entries by job and user for a date range.
 */

export const teamTimesheetSummaryPromptDefinition = {
  name: 'team-timesheet-summary',
  description: 'Summarize time entries by team member and job for a date range',
  arguments: [
    {
      name: 'dateFrom',
      description: 'Start date (ISO 8601, e.g., 2026-03-01). Defaults to start of current week.',
      required: false,
    },
    {
      name: 'dateTo',
      description: 'End date (ISO 8601). Defaults to today.',
      required: false,
    },
    {
      name: 'userId',
      description: 'Filter to a specific user/team member ID (optional)',
      required: false,
    },
  ],
};

export function getTeamTimesheetSummaryPrompt(args?: { dateFrom?: string; dateTo?: string; userId?: string }) {
  const { dateFrom, dateTo, userId } = args || {};
  const rangeText = dateFrom || dateTo
    ? `from ${dateFrom ?? 'start of week'} to ${dateTo ?? 'today'}`
    : 'for the current week';
  const userFilter = userId ? ` for user ${userId}` : '';

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Give me a timesheet summary${userFilter} ${rangeText}.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll build a timesheet summary${userFilter} ${rangeText}.

## Workflow

### Step 1: Get Team Members
Use \`manage-users\` with action \`list\` and \`filterStatus: "active"\` to get all active team members.
${userId ? `Filter results to user ID ${userId}.` : 'This gives us names to match against time entries.'}

### Step 2: Fetch Time Entries
Use \`manage-time-entries\` with action \`list\`:
${dateFrom ? `- \`filterDateFrom: "${dateFrom}"\`` : '- \`filterDateFrom\`: Start of current week'}
${dateTo ? `- \`filterDateTo: "${dateTo}"\`` : '- \`filterDateTo\`: Today'}
${userId ? `- \`filterUserId: "${userId}"\`` : ''}
- \`pageSize: 200\` (increase if needed)

**Important**: If no dates are provided, the MCP wrapper defaults to 12 months (not the API's default of 1 week). Always specify dates for timesheet reports.

Page through results using \`pageCursor\` if \`nextCursor\` is returned.

### Step 3: Aggregate & Analyse
Group time entries by:
1. **By Team Member**: Total hours per person
2. **By Job**: Total hours per job (use the job reference/number from the entry)
3. **By Team Member + Job**: Cross-tabulation showing who worked on what

For each entry, note:
- Duration/hours logged
- Whether the entry is locked (finalized for payroll)
- The job phase if applicable

### Step 4: Enrich with Job Context
For the top jobs by hours, fetch job details using \`manage-jobs\` action \`get\` to include:
- Job title and status
- Customer name
- Whether the job is still active

## Output Format

Present the summary as:

**Headline Metrics**
- Total hours logged
- Number of team members active
- Number of jobs worked on
- Locked vs unlocked entries

**By Team Member**
| Team Member | Total Hours | Jobs Worked | Locked |
|-------------|-------------|-------------|--------|

**By Job**
| Job | Title | Total Hours | Team Members |
|-----|-------|-------------|--------------|

**Detailed Breakdown** (if requested)
Individual entries grouped by person then by job.

Let me start gathering the data.`,
        },
      },
    ],
  };
}
