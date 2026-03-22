/**
 * Customer & Site Lookup Prompt
 * Guides finding or creating customers and sites — common prerequisite for jobs.
 */

export const customerSiteLookupPromptDefinition = {
  name: 'customer-site-lookup',
  description: 'Find or create a customer and site, with contacts and addresses',
  arguments: [
    {
      name: 'searchTerm',
      description: 'Customer name, company name, or address to search for',
      required: true,
    },
  ],
};

export function getCustomerSiteLookupPrompt(args: { searchTerm: string }) {
  const { searchTerm } = args;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I need to find or set up a customer and site for "${searchTerm}".`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll help you find or create a customer and site for "${searchTerm}".

## Step 1: Search for Existing Customer
Use \`manage-customers\` with action \`list\` and \`filterSearchText: "${searchTerm}"\`.
- If found, note the \`customerId\` and review the main contact and addresses.
- If multiple matches, present them so you can pick the right one.

## Step 2: Search for Existing Site
Use \`manage-sites\` with action \`list\` and \`filterSearchText: "${searchTerm}"\`.
- If found, note the \`siteId\` and confirm the address is correct.
- A customer can have multiple sites (e.g., different properties).

## Step 3: Create Customer (if not found)
To create a new customer you need at minimum:
1. **Create a contact first** using \`manage-contacts\` action \`create\`:
   - \`firstName\` (required), \`lastName\`, \`position\`, \`company\`
   - \`contactItems\`: array of \`{ contactType, contactValue }\` — types: email, phone, mobile, other, fax, website
2. **Create the customer** using \`manage-customers\` action \`create\`:
   - \`customerFullName\` (required)
   - \`mainContact\`: \`{ contactId: <id from step 1> }\`
   - Optional: \`physicalAddress\`, \`postalAddress\` with fields: address1, address2, city, state, postalCode, country

## Step 4: Create Site (if not found)
Use \`manage-sites\` action \`create\`:
- \`name\` (required): Descriptive site name
- \`siteAddress\` (required): \`{ address1, address2, city, state, postalCode, country }\`
- \`defaultContact\` (required): \`{ firstName, lastName, contactItems: [...] }\`
- Optional: \`billingContact\`, \`postalAddress\`

## Data Model Notes
- **Contacts** are reusable entities — the same contact can be referenced by multiple customers or sites.
- **Addresses** are embedded objects (not separate entities) — specified inline when creating customers or sites.
- A customer's \`physicalAddress\` is their business/home address; \`postalAddress\` is for mail.
- Sites represent where work happens — always include a complete street address for scheduling.

Let me start by searching for "${searchTerm}" across customers and sites.`,
        },
      },
    ],
  };
}
