/**
 * Weekly Report Prompt
 * Generate job status summaries for a date range
 */

export const weeklyReportPromptDefinition = {
  name: 'weekly-report',
  description: 'Generate a comprehensive job status report for a date range',
  arguments: [
    {
      name: 'dateFrom',
      description: 'Start date in ISO 8601 format (YYYY-MM-DD)',
      required: false,
    },
    {
      name: 'dateTo',
      description: 'End date in ISO 8601 format (YYYY-MM-DD)',
      required: false,
    },
  ],
};

export function getWeeklyReportPrompt(args?: { dateFrom?: string; dateTo?: string }) {
  const today = new Date();
  const defaultDateTo = today.toISOString().split('T')[0];
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const defaultDateFrom = weekAgo.toISOString().split('T')[0];

  const dateFrom = args?.dateFrom || defaultDateFrom;
  const dateTo = args?.dateTo || defaultDateTo;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Generate a comprehensive job status report for the period ${dateFrom} to ${dateTo}.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll generate a comprehensive job status report for ${dateFrom} to ${dateTo}.

## Data Collection

### 1. Active Jobs
Use \`manage-jobs\` with action \`list\`:
- \`filterStatus: "Active"\` to get all active jobs
- \`pageSize: 100\`, \`sortField: "lastModified"\`, \`sortOrder: "desc"\`
- Page through results if needed

Cross-reference with \`filterCreatedAfter: "${dateFrom}"\` to identify new jobs created in the period.

### 2. Quotes
Use \`manage-quotes\` with action \`list-all\`:
- \`modifiedAfter: "${dateFrom}"\` to get quotes touched in the period
- \`pageSize: 50\`, page through results
- Group by status: draft, sent, accepted, declined, voided

For accepted quotes, note the total value — this is won revenue.

### 3. Time Entries
Use \`manage-time-entries\` with action \`list\`:
- \`filterDateFrom: "${dateFrom}"\`
- \`filterDateTo: "${dateTo}"\`
- \`pageSize: 200\`

Aggregate by:
- Total hours across all jobs
- Hours per job (top 10 by hours)
- Hours per team member
- Locked vs unlocked entries

### 4. Team Members
Use \`manage-users\` with action \`list\` and \`filterStatus: "active"\` to get team member names for cross-referencing with time entries.

### 5. Invoices (if relevant)
Use \`manage-invoices\` with action \`list\`:
- \`dueAfter: "${dateFrom}"\`, \`dueBefore: "${dateTo}"\`
- Check for overdue invoices (due date < today, not paid)

## Report Structure

### Job Summary
| Metric | Count |
|--------|-------|
| Active Jobs | |
| New Jobs Created | |
| Jobs Completed | |

### Job Status Breakdown
| Status | Count |
|--------|-------|
| To Price | |
| Quote Sent | |
| In Progress | |
| To Invoice | |
| Completed | |

### Quotes
| Status | Count | Total Value |
|--------|-------|-------------|
| Draft | | |
| Sent | | |
| Accepted | | |
| Declined | | |
| Conversion Rate | | (Accepted / Sent) |

### Time Tracking
| Metric | Value |
|--------|-------|
| Total Hours | |
| Locked Entries | |

**Top Jobs by Hours**
| Job | Title | Hours |
|-----|-------|-------|

**Team Productivity**
| Team Member | Hours | Jobs |
|-------------|-------|------|

### Financial Highlights
- Revenue from accepted quotes
- Outstanding invoices
- Overdue invoices (if any)

## Tools Used
- \`manage-jobs\` action \`list\`: Job overview and status counts
- \`manage-quotes\` action \`list-all\`: Quote pipeline and values
- \`manage-time-entries\` action \`list\`: Hours logged
- \`manage-users\` action \`list\`: Team member details
- \`manage-invoices\` action \`list\`: Invoice status
- \`manage-jobs\` action \`get\`: Individual job details as needed

Let me start gathering data for the ${dateFrom} to ${dateTo} period.`,
        },
      },
    ],
  };
}
