/**
 * Job Creation Assistant Prompt
 * Guides users through creating a new job in Fergus
 */

export const jobCreationAssistantPromptDefinition = {
  name: 'job-creation-assistant',
  description: 'Step-by-step guide for creating a new job in Fergus (draft → finalized workflow)',
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
          text: `I'll help you create a new ${jobType} job in Fergus. Here's the recommended workflow:

## Step 1: Create a Draft Job
First, let's create a draft job with basic information:
- **Job Type**: ${jobType}
- **Title**: Give your job a descriptive title
- **Draft Mode**: Start as a draft so you can fill in details progressively

I can use the \`create-job\` tool to create a draft job for you. A draft job only requires:
- jobType: "${jobType}"
- title: Your job title
- isDraft: true (this is the default)

## Step 2: Find or Create Customer & Site
Before finalizing the job, you'll need:
- **Customer ID**: Search for an existing customer using \`list-customers\` or create a new one with \`create-customer\`
- **Site ID**: Search for an existing site using \`list-sites\` or create a new one with \`create-site\`

## Step 3: Complete Job Details
Once you have the customer and site IDs, update the draft job with:
- description: Detailed description of the work
- customerId: The customer ID
- siteId: The site ID
- customerReference: (optional) Customer's reference number

Use the \`update-job\` tool to add these details to your draft job.

## Step 4: Finalize the Job
When all required information is complete, finalize the job to make it active:
- Use the \`finalize-job\` tool with the job ID
- This converts the draft to an active job that can be scheduled and worked on

## Important Notes:
- **Draft jobs** are flexible - you can create them with minimal info and fill in details later
- **Finalized jobs** require: title, description, customerId, and siteId
- After finalizing, you can create quotes, schedule work, and track time

Would you like me to start by creating a draft job? Please provide a title for your ${jobType} job.`,
        },
      },
    ],
  };
}
