/**
 * Enquiry Triage Prompt
 * Guides the assistant through processing an enquiry into a job,
 * including customer/site lookup or creation.
 */

export const enquiryTriagePromptDefinition = {
  name: 'enquiry-triage',
  description: 'Process an incoming enquiry: review details, find or create customer and site, then create a job',
  arguments: [
    {
      name: 'enquiryId',
      description: 'Enquiry ID to triage (optional — if omitted, lists recent enquiries to choose from)',
      required: false,
    },
  ],
};

export function getEnquiryTriagePrompt(args?: { enquiryId?: string }) {
  const enquiryId = args?.enquiryId;
  const startText = enquiryId
    ? `I need to triage enquiry ${enquiryId} and convert it into a job.`
    : 'I need to triage incoming enquiries and convert them into jobs.';

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: startText,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll help you triage ${enquiryId ? `enquiry ${enquiryId}` : 'your enquiries'} and convert them into jobs.

## Workflow

### Step 1: Review the Enquiry
${enquiryId
  ? `Fetch the enquiry details using \`manage-enquiries\` with action \`get\` and \`enquiryId: ${enquiryId}\`.`
  : `List recent enquiries using \`manage-enquiries\` with action \`list\` to see what needs processing.`}

Key fields to review: title, description, contact name, contact phone, contact email, and any linked customer or site.

### Step 2: Find or Create Customer
Check if the enquiry's contact matches an existing customer:
- Use \`manage-customers\` with action \`list\` and \`filterSearchText\` with the contact name or company name.
- If a match is found, note the \`customerId\`.
- If no match, create a new customer:
  1. Use \`manage-contacts\` with action \`create\` to create the main contact (firstName, lastName, contactItems with phone and email).
  2. Use \`manage-customers\` with action \`create\` with \`customerFullName\` and the new \`mainContact\` ID.

### Step 3: Find or Create Site
Check if a site exists for this work:
- Use \`manage-sites\` with action \`list\` and \`filterSearchText\` with the address or site name.
- If a match is found, note the \`siteId\`.
- If no match, create a new site:
  - Use \`manage-sites\` with action \`create\` with the site name, address details, and a default contact.

### Step 4: Create the Job
With customer and site ready, create the job using \`manage-jobs\` with action \`create\`:
- \`title\`: From the enquiry title (required)
- \`description\`: From the enquiry description (required)
- \`jobType\`: Choose based on context — "Quote" if pricing needed, "Charge Up" for ad-hoc work (required)
- \`customerId\`: From step 2 (required)
- \`siteId\`: From step 3 (required)

The job will be created and immediately active — ready for quoting, scheduling, or direct work.

## Tips
- Always search for existing customers before creating duplicates.
- If the enquiry has a \`customerId\` or \`siteId\` already linked, use those directly.
- For trade work, "Quote" is the most common job type.
- All five fields (jobType, title, description, customerId, siteId) are required — ensure customer and site exist before creating the job.

${enquiryId ? `Let me start by fetching enquiry ${enquiryId}.` : 'Let me start by listing recent enquiries.'}`,
        },
      },
    ],
  };
}
