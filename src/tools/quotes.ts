/**
 * Quote Tools (consolidated)
 * manage-quotes: get, get-by-guid, get-detail, list, list-all, create, update, update-version, get-totals, accept, publish, mark-as-sent, decline, void
 */

import { FergusClient } from '../fergus-client.js';
import { resolveJobId } from './job-resolver.js';
import { normalizeListResponse } from '../utils/format-response.js';
import { checkOneOf, checkPageSize } from '../utils/list-params.js';

const quoteStatusOptions = ['draft', 'accepted', 'voided', 'superseded', 'declined', 'published', 'emailSent', 'emailNotSent'] as const;
const quoteListSortOptions = ['id', 'versionNumber'] as const;
const quoteListAllSortOptions = ['id', 'createdAt', 'lastModified'] as const;

const quoteSectionSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Section name. Required.',
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
          priceBookLineItemId: {
            type: 'number',
            description: 'Price book item ID (from manage-pricebooks search). For a line from the price book, send this and itemQuantity: the name, price, cost, sales account and labour flag come from the price book and the company\'s pricing tier, and any values sent for them are ignored.',
          },
          discountRate: {
            type: 'number',
            description: 'Line discount as a fraction of itemPrice, from 0 to 1: 0.1 means 10% off. itemPrice stays the undiscounted price.',
          },
          salesAccountId: {
            type: 'number',
            description: 'Sales account ID for a one-off line. A one-off line needs exactly one of isLabour or salesAccountId, not both. Ignored when priceBookLineItemId is set.',
          },
          isLabour: {
            type: 'boolean',
            description: 'For a one-off line: true for labour, false for materials; the line then uses the company\'s default labour or materials sales account. A one-off line needs exactly one of isLabour or salesAccountId, not both. Ignored when priceBookLineItemId is set.',
          },
          sortOrder: {
            type: 'number',
            description: 'Sort order for the line item.',
          },
        },
      },
    },
  },
  required: ['name'],
};

const sectionsSchema = {
  type: 'array',
  description: 'Array of quote sections with line items. For update and update-version this replaces all existing sections.',
  items: quoteSectionSchema,
};

export const manageQuotesToolDefinition = {
  name: 'manage-quotes',
  description: 'Manage quotes. Actions: get, get-by-guid, get-detail, list (per job), list-all (across jobs), create, update, update-version, get-totals, accept, publish, mark-as-sent, decline, void. On update and update-version, title and description are kept unless given. Only draft quotes can be updated. sections is still required on update and replaces all existing sections, so to change only the title or intro, get the quote first and send its sections back unchanged.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'get-by-guid', 'get-detail', 'list', 'list-all', 'create', 'update', 'update-version', 'get-totals', 'accept', 'publish', 'mark-as-sent', 'decline', 'void'],
        description: 'The action to perform.',
      },
      quoteId: {
        type: 'string',
        description: 'Quote ID. (required for: get, get-detail, update, get-totals, accept)',
      },
      quoteGuid: {
        type: 'string',
        description: 'Quote public GUID. (required for: get-by-guid)',
      },
      jobId: {
        type: 'string',
        description: 'Job number or API ID. Accepts "Job-500", "500", or an API ID. (required for: get-detail, list, create, update, update-version)',
      },
      // list/list-all params
      filterStatus: {
        type: 'string',
        description: 'Filter by quote status. (for: list, list-all)',
        enum: [...quoteStatusOptions],
      },
      createdAfter: {
        type: 'string',
        description: 'Only quotes created after this ISO 8601 timestamp. Can\'t be combined with modifiedAfter, and overrides sortField and sortOrder. (for: list-all)',
      },
      modifiedAfter: {
        type: 'string',
        description: 'Only quotes modified after this ISO 8601 timestamp. Can\'t be combined with createdAfter, and overrides sortField and sortOrder. (for: list-all)',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Maximum quotes to return. Default: 50. (for: list, list-all)',
        default: 50,
      },
      sortField: {
        type: 'string',
        enum: [...new Set([...quoteListSortOptions, ...quoteListAllSortOptions])],
        description: 'Sort field. For list: id or versionNumber. For list-all: id, createdAt or lastModified. Ignored by list-all when createdAfter or modifiedAfter is given. (for: list, list-all)',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order. (for: list, list-all)',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for the next page. (for: list, list-all)',
      },
      // create/update params
      title: {
        type: 'string',
        description: 'Quote title. Cannot be empty. On update, the current title is kept if omitted. (required for: create; for: update, update-version)',
      },
      description: {
        type: 'string',
        description: "Quote intro, shown to the customer at the top of the quote. HTML: send paragraphs as <p> and line breaks as <br>, or they run together. On update, the current intro is kept if omitted; an empty string clears it. (for: create, update, update-version)",
      },
      dueDays: {
        type: 'number',
        description: 'Days until the quote is due, 7-180. (required for: create)',
        minimum: 7,
        maximum: 180,
      },
      // create/update/update-version params
      sections: {
        ...sectionsSchema,
        description: 'Array of quote sections with line items. Replaces all existing sections on update. For a line from the price book, send priceBookLineItemId (from manage-pricebooks search) and itemQuantity; the API fills in the rest. For a one-off line, send itemName and itemPrice, and exactly one of isLabour (true for labour, false for materials, using the company\'s default account for that type) or salesAccountId; the API rejects a one-off line with neither or both. (required for: create, update, update-version)',
      },
      // update-version params
      versionNumber: {
        type: 'number',
        description: 'Quote version number. (required for: update-version)',
      },
      // get-totals/accept params
      selectedSectionIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Section IDs to include in totals calculation or acceptance. (for: get-totals, accept)',
      },
      // accept params
      acceptedBy: {
        type: 'string',
        description: 'Name or employee GUID of the person accepting. (required for: accept)',
      },
      acceptedAt: {
        type: 'string',
        description: 'Acceptance timestamp in ISO 8601 format. (for: accept)',
      },
      // publish params
      publishedAt: {
        type: 'string',
        description: 'Publish timestamp in ISO 8601 format. (for: publish)',
      },
      publishedBy: {
        type: 'string',
        description: 'Name or employee GUID of the person publishing. (for: publish)',
      },
      // mark-as-sent params
      isSent: {
        type: 'boolean',
        description: 'Whether the quote has been sent. (for: mark-as-sent)',
      },
      // decline params
      declinedAt: {
        type: 'string',
        description: 'Decline timestamp in ISO 8601 format. (for: decline)',
      },
      reasonNotes: {
        type: 'string',
        description: 'Reason for declining. (for: decline)',
      },
      rejectedBy: {
        type: 'string',
        description: 'Name or employee GUID of the person declining. (for: decline)',
      },
      // void params
      voidedAt: {
        type: 'string',
        description: 'Void timestamp in ISO 8601 format. (for: void)',
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
    case 'publish':
      return handlePublishQuote(fergusClient, args);
    case 'mark-as-sent':
      return handleMarkQuoteAsSent(fergusClient, args);
    case 'decline':
      return handleDeclineQuote(fergusClient, args);
    case 'void':
      return handleVoidQuote(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, get-by-guid, get-detail, list, list-all, create, update, update-version, get-totals, accept, publish, mark-as-sent, decline, void`);
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
  checkPageSize(pageSize);
  checkOneOf('sortField', sortField, quoteListSortOptions);
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
    content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(quotes), null, 2) }],
  };
}

// ===== LIST ALL QUOTES =====

async function handleListAllQuotes(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { filterStatus, createdAfter, modifiedAfter, pageSize = 50, sortField, sortOrder, pageCursor } = args;
  checkPageSize(pageSize);
  checkOneOf('sortField', sortField, quoteListAllSortOptions);
  if (createdAfter && modifiedAfter) {
    throw new Error('createdAfter and modifiedAfter can\'t be combined; send one of them. Nothing was listed.');
  }

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
    content: [{ type: 'text' as const, text: JSON.stringify(normalizeListResponse(quotes), null, 2) }],
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

function assertTitleNotEmpty(title: unknown) {
  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    throw new Error('title cannot be empty');
  }
}

/**
 * PUT saves an omitted title or description as null, so send the caller's
 * value when given and the quote's current value otherwise.
 */
function buildUpdateRequestBody(existing: any, args: Record<string, any>) {
  return {
    title: args.title !== undefined ? args.title : existing.title || '',
    description: args.description !== undefined ? args.description : existing.description || null,
    sections: args.sections,
  };
}

async function handleUpdateQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, quoteId, sections } = args;
  if (!jobRef || !quoteId || !sections) {
    throw new Error('jobId, quoteId, and sections are required for update action');
  }
  assertTitleNotEmpty(args.title);

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  try {
    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${quoteId}`);
    const requestBody = buildUpdateRequestBody(existingQuote.data, args);

    const quote = await fergusClient.put(`/jobs/${jobId}/quotes/${quoteId}`, requestBody);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
    };
  } catch (error: any) {
    if (isNotDraftError(error)) {
      throw new Error(
        `Cannot update quote ${quoteId}: The quote must be in DRAFT status. ` +
        `Use create action to create a new quote version instead.`
      );
    }
    throw error;
  }
}

/** The API's 400 for a quote that isn't a draft; its message is in the response body. */
function isNotDraftError(error: any): boolean {
  return [error?.response?.message, error?.message].some(
    (m) => typeof m === 'string' && m.includes('must be a draft')
  );
}

// ===== UPDATE QUOTE VERSION =====

/**
 * Finds a job's quote by version number. The quotes list is paged (10 by
 * default) and there's no lookup by version, so read every page.
 */
async function findQuoteVersion(fergusClient: FergusClient, jobId: number, versionNumber: number) {
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (cursor) params.append('pageCursor', cursor);
    const response: any = await fergusClient.get(`/jobs/${jobId}/quotes?${params.toString()}`);
    const { data, pagination } = normalizeListResponse(response);
    const match = data.find((q: any) => Number(q.versionNumber) === Number(versionNumber));
    if (match) return match;
    cursor = pagination.nextCursor;
    if (cursor && seen.has(cursor)) break; // never loop on a repeated cursor
    if (cursor) seen.add(cursor);
  } while (cursor);
  return undefined;
}

async function handleUpdateQuoteVersion(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { jobId: jobRef, versionNumber, sections } = args;
  if (!jobRef || !versionNumber || !sections) {
    throw new Error('jobId, versionNumber, and sections are required for update-version action');
  }
  assertTitleNotEmpty(args.title);

  const { id: jobId } = await resolveJobId(fergusClient, String(jobRef));

  try {
    const targetQuote = await findQuoteVersion(fergusClient, jobId, versionNumber);
    if (!targetQuote) {
      throw new Error(`Quote version ${versionNumber} not found for job ${jobId}`);
    }

    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${targetQuote.id}`);
    const requestBody = buildUpdateRequestBody(existingQuote.data, args);

    const quote = await fergusClient.put(`/jobs/${jobId}/quotes/version/${versionNumber}`, requestBody);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }],
    };
  } catch (error: any) {
    if (isNotDraftError(error)) {
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

// ===== PUBLISH QUOTE =====

async function handlePublishQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId } = args;
  if (!quoteId) {
    throw new Error('quoteId is required for publish action');
  }

  const requestBody: Record<string, unknown> = {};
  if (args.publishedAt) requestBody.publishedAt = args.publishedAt;
  if (args.publishedBy) requestBody.publishedBy = args.publishedBy;

  const result = await fergusClient.post(`/jobs/quotes/${quoteId}/publish`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

// ===== MARK QUOTE AS SENT =====

async function handleMarkQuoteAsSent(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId } = args;
  if (!quoteId) {
    throw new Error('quoteId is required for mark-as-sent action');
  }

  const requestBody: Record<string, unknown> = {};
  if (args.isSent !== undefined) requestBody.isSent = args.isSent;

  const result = await fergusClient.post(`/jobs/quotes/${quoteId}/markAsSent`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

// ===== DECLINE QUOTE =====

async function handleDeclineQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId } = args;
  if (!quoteId) {
    throw new Error('quoteId is required for decline action');
  }

  const requestBody: Record<string, unknown> = {};
  if (args.declinedAt) requestBody.declinedAt = args.declinedAt;
  if (args.reasonNotes) requestBody.reasonNotes = args.reasonNotes;
  if (args.rejectedBy) requestBody.rejectedBy = args.rejectedBy;

  const result = await fergusClient.post(`/jobs/quotes/${quoteId}/decline`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

// ===== VOID QUOTE =====

async function handleVoidQuote(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { quoteId } = args;
  if (!quoteId) {
    throw new Error('quoteId is required for void action');
  }

  const requestBody: Record<string, unknown> = {};
  if (args.voidedAt) requestBody.voidedAt = args.voidedAt;

  const result = await fergusClient.post(`/jobs/quotes/${quoteId}/void`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
