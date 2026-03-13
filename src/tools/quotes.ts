/**
 * Quote Tools (consolidated)
 * manage-quotes: get, get-by-guid, get-detail, list, list-all, create, update, update-version, get-totals, accept
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

const quoteStatusOptions = ['draft', 'accepted', 'voided', 'superseded', 'declined', 'published', 'emailSent', 'emailNotSent'] as const;
const quoteListSortOptions = ['id', 'versionNumber'] as const;
const quoteListAllSortOptions = ['id', 'createdAt', 'lastModified'] as const;
const quirksResourceHint = 'Read `docs://fergus/known-quirks.md` before write operations.';

const quoteSectionSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Section name.',
    },
    description: {
      type: 'string',
      description: 'Section description.',
    },
    sortOrder: {
      type: 'number',
      description: 'Sort order for the section.',
    },
    lineItems: {
      type: 'array',
      description: 'Line items in this section.',
      items: {
        type: 'object',
        properties: {
          itemName: {
            type: 'string',
            description: 'Name of the line item.',
          },
          itemQuantity: {
            type: 'number',
            description: 'Quantity. Default: 1.',
          },
          itemPrice: {
            type: 'number',
            description: 'Price per unit.',
          },
          itemCost: {
            type: 'number',
            description: 'Cost per unit. Default: 0.',
          },
          salesAccountId: {
            type: 'number',
            description: 'Sales account ID. Use either salesAccountId or isLabour, not both.',
          },
          isLabour: {
            type: 'boolean',
            description: 'Whether this is a labour item. Use either isLabour or salesAccountId, not both.',
          },
          sortOrder: {
            type: 'number',
            description: 'Sort order for the line item.',
          },
        },
      },
    },
  },
};

const sectionsSchema = {
  type: 'array',
  description: 'Array of quote sections with line items. For update and update-version this replaces all existing sections.',
  items: quoteSectionSchema,
};

export const manageQuotesToolDefinition = {
  name: 'manage-quotes',
  description: 'Manage quotes with action-specific schemas. Write actions include wrapper behavior notes for Fergus API quirks.',
  inputSchema: {
    description: 'Choose exactly one quote action schema.',
    oneOf: [
      {
        title: 'Get Quote',
        description: 'Get a quote by quote ID using the global quote endpoint.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get',
            description: 'Get a quote by ID.',
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID.',
          },
        },
        required: ['action', 'quoteId'],
      },
      {
        title: 'Get Quote By GUID',
        description: 'Get a quote by public GUID using the Fergus global GUID endpoint.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get-by-guid',
            description: 'Get a quote by GUID.',
          },
          quoteGuid: {
            type: 'string',
            description: 'Quote GUID.',
          },
        },
        required: ['action', 'quoteGuid'],
      },
      {
        title: 'Get Job Quote Detail',
        description: 'Get quote detail using the job-scoped quote endpoint.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get-detail',
            description: 'Get detailed quote data for a job.',
          },
          jobId: {
            type: 'string',
            description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID.',
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID.',
          },
        },
        required: ['action', 'jobId', 'quoteId'],
      },
      {
        title: 'List Quotes For Job',
        description: 'List quotes for a single job. Use list-all to search quotes across all jobs.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'list',
            description: 'List quotes for one job.',
          },
          jobId: {
            type: 'string',
            description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID.',
          },
          filterStatus: {
            type: 'string',
            description: 'Filter by quote status.',
            enum: [...quoteStatusOptions],
          },
          pageSize: {
            type: 'number',
            description: 'Maximum quotes to return. Default: 50.',
            default: 50,
          },
          sortField: {
            type: 'string',
            description: 'Sort field for job-scoped listing.',
            enum: [...quoteListSortOptions],
          },
          sortOrder: {
            type: 'string',
            description: 'Sort order.',
            enum: ['asc', 'desc'],
          },
          pageCursor: {
            type: 'string',
            description: 'Pagination cursor for the next page.',
          },
        },
        required: ['action', 'jobId'],
      },
      {
        title: 'List Quotes Across All Jobs',
        description: 'List quotes across all jobs using Fergus global quote listing.',
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'list-all',
            description: 'List quotes across all jobs.',
          },
          filterStatus: {
            type: 'string',
            description: 'Filter by quote status.',
            enum: [...quoteStatusOptions],
          },
          createdAfter: {
            type: 'string',
            description: 'Filter quotes created after this ISO 8601 timestamp.',
          },
          modifiedAfter: {
            type: 'string',
            description: 'Filter quotes modified after this ISO 8601 timestamp.',
          },
          pageSize: {
            type: 'number',
            description: 'Maximum quotes to return. Default: 50.',
            default: 50,
          },
          sortField: {
            type: 'string',
            description: 'Sort field for global quote listing.',
            enum: [...quoteListAllSortOptions],
          },
          sortOrder: {
            type: 'string',
            description: 'Sort order.',
            enum: ['asc', 'desc'],
          },
          pageCursor: {
            type: 'string',
            description: 'Pagination cursor for the next page.',
          },
        },
        required: ['action'],
      },
      {
        title: 'Create Quote',
        description: `Create a quote for a job. Behavior Notes: quote line items must use either salesAccountId or isLabour, not both. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'create',
            description: 'Create a quote.',
          },
          jobId: {
            type: 'string',
            description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID.',
          },
          title: {
            type: 'string',
            description: 'Quote title.',
          },
          description: {
            type: 'string',
            description: 'Quote description.',
          },
          dueDays: {
            type: 'number',
            description: 'Days until the quote is due. Fergus accepts 7-180.',
            minimum: 7,
            maximum: 180,
          },
          sections: sectionsSchema,
        },
        required: ['action', 'jobId', 'title', 'dueDays', 'sections'],
      },
      {
        title: 'Update Quote',
        description: `Update a quote by quote ID. Behavior Notes: Fergus only allows draft quotes to be updated, and the sections array replaces all existing sections. This wrapper preserves existing title and description before sending the update payload. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'update',
            description: 'Update a quote by quote ID.',
          },
          jobId: {
            type: 'string',
            description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID.',
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID.',
          },
          sections: sectionsSchema,
        },
        required: ['action', 'jobId', 'quoteId', 'sections'],
      },
      {
        title: 'Update Quote By Version',
        description: `Update a quote by version number. Behavior Notes: Fergus only allows draft quotes to be updated, and the sections array replaces all existing sections. This wrapper preserves existing title and description before sending the update payload. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'update-version',
            description: 'Update a quote by version number.',
          },
          jobId: {
            type: 'string',
            description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID.',
          },
          versionNumber: {
            type: 'number',
            description: 'Quote version number.',
          },
          sections: sectionsSchema,
        },
        required: ['action', 'jobId', 'versionNumber', 'sections'],
      },
      {
        title: 'Get Quote Totals',
        description: `Get quote totals using the Fergus global totals endpoint. Behavior Notes: selectedSectionIds may be needed for optional or multi-select sections. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'get-totals',
            description: 'Get quote totals.',
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID.',
          },
          selectedSectionIds: {
            type: 'array',
            items: {
              type: 'number',
            },
            description: 'Optional section IDs to include in the totals calculation.',
          },
        },
        required: ['action', 'quoteId'],
      },
      {
        title: 'Accept Quote',
        description: `Accept a quote using the Fergus global accept endpoint. Behavior Notes: acceptedBy is required and selectedSectionIds may be needed for optional or multi-select sections. ${quirksResourceHint}`,
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            const: 'accept',
            description: 'Accept a quote.',
          },
          quoteId: {
            type: 'string',
            description: 'Quote ID.',
          },
          acceptedBy: {
            type: 'string',
            description: 'Name or employee GUID of the person accepting the quote.',
          },
          acceptedAt: {
            type: 'string',
            description: 'Optional acceptance timestamp in ISO 8601 format.',
          },
          selectedSectionIds: {
            type: 'array',
            items: {
              type: 'number',
            },
            description: 'Optional section IDs accepted by the customer.',
          },
        },
        required: ['action', 'quoteId', 'acceptedBy'],
      },
    ],
  },
};

export async function handleManageQuotes(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetQuote(fergusClient, args);
    case 'get-by-guid':
      return handleGetQuoteByGuid(fergusClient, args);
    case 'get-detail':
      return handleGetQuoteDetail(fergusClient, args);
    case 'list':
      return handleListQuotes(fergusClient, args);
    case 'list-all':
      return handleListAllQuotes(fergusClient, args);
    case 'create':
      return handleCreateQuote(fergusClient, args);
    case 'update':
      return handleUpdateQuote(fergusClient, args);
    case 'update-version':
      return handleUpdateQuoteVersion(fergusClient, args);
    case 'get-totals':
      return handleGetQuoteTotals(fergusClient, args);
    case 'accept':
      return handleAcceptQuote(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, get-by-guid, get-detail, list, list-all, create, update, update-version, get-totals, accept`);
  }
}

// ===== GET QUOTE =====

async function handleGetQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId } = args;
  if (!quoteId) {
    throw new Error('quoteId is required for get action');
  }

  const quote = await fergusClient.get(`/jobs/quotes/${quoteId}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
  };
}

// ===== GET QUOTE BY GUID =====

async function handleGetQuoteByGuid(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteGuid } = args;
  if (!quoteGuid) {
    throw new Error('quoteGuid is required for get-by-guid action');
  }

  const quote = await fergusClient.get(`/jobs/quotes/guid/${quoteGuid}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
  };
}

// ===== GET QUOTE DETAIL =====

async function handleGetQuoteDetail(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, quoteId } = args;
  if (!jobRef || !quoteId) {
    throw new Error('jobId and quoteId are required for get-detail action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));
  const quoteDetail = await fergusClient.get(`/jobs/${jobId}/quotes/${quoteId}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(quoteDetail, null, 2) }],
  };
}

// ===== LIST QUOTES (job-scoped) =====

async function handleListQuotes(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, filterStatus, pageSize = 50, sortField, sortOrder, pageCursor } = args;
  if (!jobRef) {
    throw new Error('jobId is required for list action. Use list-all to search quotes across all jobs.');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterStatus) params.append('filterStatus', filterStatus);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const endpoint = `/jobs/${jobId}/quotes?${params.toString()}`;
  const quotes = await fergusClient.get(endpoint);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(quotes, null, 2) }],
  };
}

// ===== LIST ALL QUOTES =====

async function handleListAllQuotes(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { filterStatus, createdAfter, modifiedAfter, pageSize = 50, sortField, sortOrder, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterStatus) params.append('filterStatus', filterStatus);
  if (createdAfter) params.append('createdAfter', createdAfter);
  if (modifiedAfter) params.append('modifiedAfter', modifiedAfter);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const quotes = await fergusClient.get(`/jobs/quotes?${params.toString()}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(quotes, null, 2) }],
  };
}

// ===== CREATE QUOTE =====

async function handleCreateQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, title, description, dueDays, sections } = args;
  if (!jobRef || !title || !dueDays || !sections) {
    throw new Error('jobId, title, dueDays, and sections are required for create action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  if (dueDays < 7 || dueDays > 180) {
    throw new Error('dueDays must be between 7 and 180');
  }

  const requestBody: any = { title, dueDays, sections };
  if (description) requestBody.description = description;

  const quote = await fergusClient.post(`/jobs/${jobId}/quotes`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
  };
}

// ===== UPDATE QUOTE =====

async function handleUpdateQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, quoteId, sections } = args;
  if (!jobRef || !quoteId || !sections) {
    throw new Error('jobId, quoteId, and sections are required for update action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  try {
    // Fetch existing quote to preserve title and description (API workaround)
    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${quoteId}`);
    const requestBody = {
      title: existingQuote.data.title || '',
      description: existingQuote.data.description || null,
      sections,
    };

    const quote = await fergusClient.put(`/jobs/${jobId}/quotes/${quoteId}`, requestBody);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
    };
  } catch (error: any) {
    if (error.message?.includes('must be a draft')) {
      throw new Error(
        `Cannot update quote ${quoteId}: The quote must be in DRAFT status. ` +
        `Use create action to create a new quote version instead.`
      );
    }
    throw error;
  }
}

// ===== UPDATE QUOTE VERSION =====

async function handleUpdateQuoteVersion(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, versionNumber, sections } = args;
  if (!jobRef || !versionNumber || !sections) {
    throw new Error('jobId, versionNumber, and sections are required for update-version action');
  }

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  try {
    const quotesResponse: any = await fergusClient.get(`/jobs/${jobId}/quotes`);
    const targetQuote = quotesResponse.data.find((q: any) => q.versionNumber === versionNumber);
    if (!targetQuote) {
      throw new Error(`Quote version ${versionNumber} not found for job ${jobId}`);
    }

    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${targetQuote.id}`);
    const requestBody = {
      title: existingQuote.data.title || '',
      description: existingQuote.data.description || null,
      sections,
    };

    const quote = await fergusClient.put(`/jobs/${jobId}/quotes/version/${versionNumber}`, requestBody);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
    };
  } catch (error: any) {
    if (error.message?.includes('must be a draft')) {
      throw new Error(
        `Cannot update quote version ${versionNumber}: The quote must be in DRAFT status. ` +
        `Use create action to create a new quote version instead.`
      );
    }
    throw error;
  }
}

// ===== GET QUOTE TOTALS =====

async function handleGetQuoteTotals(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId, selectedSectionIds } = args;
  if (!quoteId) {
    throw new Error('quoteId is required for get-totals action');
  }

  const requestBody: Record<string, unknown> = {};
  if (selectedSectionIds) requestBody.selectedSectionIds = selectedSectionIds;

  const totals = await fergusClient.post(`/jobs/quotes/${quoteId}/totals`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(totals, null, 2) }],
  };
}

// ===== ACCEPT QUOTE =====

async function handleAcceptQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId, acceptedBy, acceptedAt, selectedSectionIds } = args;
  if (!quoteId || !acceptedBy) {
    throw new Error('quoteId and acceptedBy are required for accept action');
  }

  const requestBody: Record<string, unknown> = {
    acceptedBy,
  };
  if (acceptedAt) requestBody.acceptedAt = acceptedAt;
  if (selectedSectionIds) requestBody.selectedSectionIds = selectedSectionIds;

  const result = await fergusClient.post(`/jobs/quotes/${quoteId}/accept`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
