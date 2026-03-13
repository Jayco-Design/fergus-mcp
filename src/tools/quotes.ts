/**
 * Quote Tools (consolidated)
 * manage-quotes: get, get-by-guid, get-detail, list, list-all, create, update, update-version, get-totals, accept
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';

export const manageQuotesToolDefinition = {
  name: 'manage-quotes',
  description: 'Manage quotes. Actions: get, get-by-guid, get-detail, list, list-all, create, update, update-version, get-totals, accept',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'get-by-guid', 'get-detail', 'list', 'list-all', 'create', 'update', 'update-version', 'get-totals', 'accept'],
        description: 'The action to perform',
      },
      jobId: {
        type: 'string',
        description: 'Job number or ID. Accepts "Job-500", "500", or API IDs. (required for: get-detail, list, create, update, update-version)',
      },
      quoteId: {
        type: 'string',
        description: 'Quote ID (required for: get, get-detail, update, get-totals, accept)',
      },
      quoteGuid: {
        type: 'string',
        description: 'Quote GUID (required for: get-by-guid)',
      },
      versionNumber: {
        type: 'number',
        description: 'Quote version number (required for: update-version)',
      },
      // list params
      filterStatus: {
        type: 'string',
        description: 'Filter by quote status (for: list, list-all)',
      },
      createdAfter: {
        type: 'string',
        description: 'Filter quotes created after this date ISO 8601 (for: list-all)',
      },
      modifiedAfter: {
        type: 'string',
        description: 'Filter quotes modified after this date ISO 8601 (for: list-all)',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of quotes to return per page (for: list, list-all, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list or list-all)',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list or list-all)',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page (for: list or list-all)',
      },
      // create params
      title: {
        type: 'string',
        description: 'Quote title (required for: create)',
      },
      description: {
        type: 'string',
        description: 'Quote description (for: create)',
      },
      dueDays: {
        type: 'number',
        description: 'Days until quote is due, 7-180 (required for: create)',
        minimum: 7,
        maximum: 180,
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections with line items. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, not both. For update/update-version this REPLACES ALL existing sections.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Section name' },
            description: { type: 'string', description: 'Section description' },
            sortOrder: { type: 'number', description: 'Sort order for the section' },
            lineItems: {
              type: 'array',
              description: 'Line items in this section',
              items: {
                type: 'object',
                properties: {
                  itemName: { type: 'string', description: 'Name of the line item' },
                  itemQuantity: { type: 'number', description: 'Quantity (default: 1)' },
                  itemPrice: { type: 'number', description: 'Price per unit' },
                  itemCost: { type: 'number', description: 'Cost per unit (default: 0)' },
                  salesAccountId: { type: 'number', description: 'Sales account ID (use EITHER this OR isLabour)' },
                  isLabour: { type: 'boolean', description: 'Whether this is a labour item (use EITHER this OR salesAccountId)' },
                  sortOrder: { type: 'number', description: 'Sort order for the line item' },
                },
              },
            },
          },
        },
      },
      selectedSectionIds: {
        type: 'array',
        items: {
          type: 'number',
        },
        description: 'Optional section IDs to include when getting totals or accepting a quote',
      },
      acceptedBy: {
        type: 'string',
        description: 'Name or employee GUID of the person accepting the quote (required for: accept)',
      },
      acceptedAt: {
        type: 'string',
        description: 'Optional acceptance timestamp in ISO 8601 format (for: accept)',
      },
    },
    required: ['action'],
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
