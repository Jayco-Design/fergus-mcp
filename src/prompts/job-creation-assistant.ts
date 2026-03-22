/**
 * Job Creation Assistant Prompt
 * Guides users through creating a new job in Fergus
 */

export const jobCreationAssistantPromptDefinition = {
  name: 'job-creation-assistant',
  description: 'Step-by-step guide for creating a new job in Fergus (customer + site required)',
  arguments: [
    {
      name: 'jobType',
      description: 'Type of job: Quote, Estimate, or Charge Up',
      required: false,
    },
  ],
};

export function getJobCreationAssistantPrompt(args?: { jobType?: string }) {
  const jobType = args?.jobType || 'Quote';

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I want to create a new ${jobType} job in Fergus. Please guide me through the process step by step.`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll help you create a new ${jobType} job in Fergus. Jobs require a customer and site before creation, so we'll set those up first.

## Step 1: Find or Create the Customer
Search for an existing customer using \`manage-customers\` with action \`list\` and \`filterSearchText\`.
- If found, note the \`customerId\`.
- If not found, create one:
  1. Create a contact with \`manage-contacts\` action \`create\` (firstName required, plus contactItems for phone/email)
  2. Create the customer with \`manage-customers\` action \`create\` (\`customerFullName\` + \`mainContact\` with the contact ID)

## Step 2: Find or Create the Site
Search for an existing site using \`manage-sites\` with action \`list\` and \`filterSearchText\`.
- If found, note the \`siteId\`.
- If not found, create one with \`manage-sites\` action \`create\`:
  - \`siteAddress\` (required): street address where work will happen
  - \`defaultContact\` (required): contact details for the site
  - \`name\` (optional): descriptive site name

## Step 3: Create the Job
With the customer and site ready, create the job using \`manage-jobs\` with action \`create\`:
- **jobType**: "${jobType}" (required)
- **title**: A descriptive job title (required)
- **description**: Detailed description of the work (required)
- **customerId**: From step 1 (required)
- **siteId**: From step 2 (required)
- **customerReference**: Customer's own reference number (optional)

The job will be created and immediately active — ready for quoting, scheduling, and work.

## Step 4: Next Steps (optional)
After the job is created, you can:
- **Create a quote**: Use \`manage-quotes\` action \`create\` with the new \`jobId\`
- **Add job phases**: Use \`manage-jobs\` action \`create-phase\` to break the job into phases (e.g., "Phase A: Plumbing", "Phase B: Electrical")
- **Update phase details**: Use \`manage-jobs\` action \`update-phase\` to modify phase names/descriptions
- **Remove a phase**: Use \`manage-jobs\` action \`void-phase\`
- **Check financials**: Use \`manage-jobs\` action \`get-financial-summary\` or \`get-phase-financial-summary\`

## Important Notes
- All jobs require: jobType, title, description, customerId, and siteId
- Always search for existing customers and sites before creating new ones to avoid duplicates
- Job types: **Quote** (priced upfront), **Estimate** (less formal), **Charge Up** (time & materials)

Would you like me to start by searching for the customer? Please provide the customer name or company.`,
        },
      },
    ],
  };
}
