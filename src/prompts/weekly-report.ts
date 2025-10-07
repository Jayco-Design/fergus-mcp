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
  // Default to current week if no dates provided
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
          text: `I'll help you generate a comprehensive job status report for ${dateFrom} to ${dateTo}. Here's what I'll analyze:

## Report Structure

### 1. Job Overview
- **Active Jobs**: List all active jobs
- **Job Status Breakdown**: Count by status
- **New Jobs**: Jobs created during this period

### 2. Quote Analysis
- **Pending Quotes**: Quotes awaiting customer response
- **Accepted Quotes**: Quotes approved in this period
- **Quote Value**: Total value of quotes issued
- **Conversion Rate**: Accepted vs total quotes

### 3. Time Tracking
- **Total Hours**: Hours logged across all jobs
- **By Job**: Time breakdown per job
- **By User**: Team member productivity
- **Locked Entries**: Finalized time entries

### 4. Key Metrics
- **Jobs Completed**: Finished in this period
- **Revenue Potential**: Value of accepted quotes
- **Team Utilization**: Hours logged vs available

## Data Collection Steps:

1. **List Active Jobs**
   - Use \`list-jobs\` to get all active jobs
   - Filter or analyze for the date range

2. **Analyze Quotes**
   - Use \`list-quotes\` with \`createdAfter\` and \`modifiedAfter\` filters
   - Group by status (pending, accepted, declined)
   - Calculate total quote values

3. **Time Entry Summary**
   - Use \`list-time-entries\` with \`filterDateFrom\` and \`filterDateTo\`
   - Aggregate by job and user
   - Identify locked (finalized) entries

4. **Team Analysis**
   - Use \`list-users\` to get active team members
   - Cross-reference with time entries
   - Calculate utilization rates

## Report Format:

\`\`\`
📊 Fergus Job Report: ${dateFrom} to ${dateTo}

JOBS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Active Jobs:        [count]
New Jobs Created:   [count]
Jobs Completed:     [count]

QUOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pending:           [count] ($[value])
Accepted:          [count] ($[value])
Conversion Rate:   [percentage]%

TIME TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Hours:       [hours]
Locked Entries:    [count]

TOP JOBS BY HOURS
1. [Job Title] - [hours]h
2. [Job Title] - [hours]h
3. [Job Title] - [hours]h

TEAM PRODUCTIVITY
[User Name]:       [hours]h
[User Name]:       [hours]h
\`\`\`

## Tools I'll Use:
- \`list-jobs\`: Get job overview
- \`list-quotes\`: Analyze quote status and values
- \`list-time-entries\`: Track hours worked
- \`list-users\`: Get team member details
- \`get-job\`: Fetch specific job details as needed

Let me start gathering this data. I'll fetch the jobs, quotes, and time entries for your specified period.`,
        },
      },
    ],
  };
}
