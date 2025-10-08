/**
 * Quote Tools
 * All quote-related operations (get, get-detail, list, create, update, update-version)
 */

import { FergusClient } from '../fergus-client.js';

// ===== GET QUOTE =====

export const getQuoteToolDefinition = {
  name: 'get-quote',
  description: 'Get details of a specific quote by ID',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      quoteId: {
        type: 'string',
        description: 'The ID of the quote to retrieve',
      },
    },
    required: ['quoteId'],
  },
};

export async function handleGetQuote(
  fergusClient: FergusClient,
  args: { quoteId: string }
) {
  const { quoteId } = args;

  if (!quoteId) {
    throw new Error('quoteId is required');
  }

  const quote = await fergusClient.get(`/jobs/quotes/${quoteId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quote, null, 2),
      },
    ],
  };
}

// ===== GET QUOTE DETAIL =====

export const getQuoteDetailToolDefinition = {
  name: 'get-quote-detail',
  description: 'Get comprehensive details of a specific quote including sections and line items',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The ID of the job',
      },
      quoteId: {
        type: 'string',
        description: 'The ID of the quote to retrieve',
      },
    },
    required: ['jobId', 'quoteId'],
  },
};

export async function handleGetQuoteDetail(
  fergusClient: FergusClient,
  args: { jobId: string; quoteId: string }
) {
  const { jobId, quoteId } = args;

  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!quoteId) {
    throw new Error('quoteId is required');
  }

  const quoteDetail = await fergusClient.get(`/jobs/${jobId}/quotes/${quoteId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quoteDetail, null, 2),
      },
    ],
  };
}

// ===== LIST QUOTES =====

export const listQuotesToolDefinition = {
  name: 'list-quotes',
  description: 'List quotes across all jobs with optional filtering',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      filterStatus: {
        type: 'string',
        description: 'Filter by quote status',
      },
      createdAfter: {
        type: 'string',
        description: 'Filter quotes created after this date (ISO 8601)',
      },
      modifiedAfter: {
        type: 'string',
        description: 'Filter quotes modified after this date (ISO 8601)',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of quotes to return per page',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page',
      },
    },
  },
};

export async function handleListQuotes(
  fergusClient: FergusClient,
  args: {
    filterStatus?: string;
    createdAfter?: string;
    modifiedAfter?: string;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    pageCursor?: string;
  }
) {
  const {
    filterStatus,
    createdAfter,
    modifiedAfter,
    pageSize = 50,
    sortField,
    sortOrder,
    pageCursor,
  } = args || {};

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());

  if (filterStatus) params.append('filterStatus', filterStatus);
  if (createdAfter) params.append('createdAfter', createdAfter);
  if (modifiedAfter) params.append('modifiedAfter', modifiedAfter);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const endpoint = `/jobs/quotes?${params.toString()}`;
  const quotes = await fergusClient.get(endpoint);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quotes, null, 2),
      },
    ],
  };
}

// ===== CREATE QUOTE =====

export const createQuoteToolDefinition = {
  name: 'create-quote',
  description: 'Create a new quote for a job. Requires jobId, title, dueDays, and sections array. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, but NOT BOTH.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'The ID of the job to create a quote for',
      },
      title: {
        type: 'string',
        description: 'Quote title (must not be empty)',
      },
      description: {
        type: 'string',
        description: 'Quote description (optional)',
      },
      dueDays: {
        type: 'number',
        description: 'Number of days until quote is due (minimum: 7, maximum: 180)',
        minimum: 7,
        maximum: 180,
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections containing line items',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Section name',
            },
            description: {
              type: 'string',
              description: 'Section description',
            },
            sortOrder: {
              type: 'number',
              description: 'Sort order for the section',
            },
            lineItems: {
              type: 'array',
              description: 'Line items in this section',
              items: {
                type: 'object',
                properties: {
                  itemName: {
                    type: 'string',
                    description: 'Name of the line item',
                  },
                  itemQuantity: {
                    type: 'number',
                    description: 'Quantity of the item (default: 1)',
                  },
                  itemPrice: {
                    type: 'number',
                    description: 'Price per unit',
                  },
                  itemCost: {
                    type: 'number',
                    description: 'Cost per unit (default: 0)',
                  },
                  salesAccountId: {
                    type: 'number',
                    description: 'Sales account ID (use EITHER this OR isLabour, not both)',
                  },
                  isLabour: {
                    type: 'boolean',
                    description: 'Whether this is a labour item (use EITHER this OR salesAccountId, not both)',
                  },
                  sortOrder: {
                    type: 'number',
                    description: 'Sort order for the line item',
                  },
                },
              },
            },
          },
        },
      },
    },
    required: ['jobId', 'title', 'dueDays', 'sections'],
  },
};

export async function handleCreateQuote(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    title: string;
    description?: string;
    dueDays: number;
    sections: any[];
  }
) {
  const { jobId, title, description, dueDays, sections } = args;

  // Validate dueDays range
  if (dueDays < 7 || dueDays > 180) {
    throw new Error('dueDays must be between 7 and 180');
  }

  const requestBody: any = {
    title,
    dueDays,
    sections,
  };

  if (description) {
    requestBody.description = description;
  }

  const quote = await fergusClient.post(`/jobs/${jobId}/quotes`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(quote, null, 2),
      },
    ],
  };
}

// ===== UPDATE QUOTE =====

export const updateQuoteToolDefinition = {
  name: 'update-quote',
  description: 'Update an existing DRAFT quote. WARNING: This operation REPLACES ALL EXISTING SECTIONS with the sections you provide. If you only want to modify one section, you MUST first fetch the quote using get-quote-detail to get ALL existing sections, then include ALL sections (both modified and unmodified) in your update. The quote must be in draft status (not sent, accepted, or locked) to be updated. To modify a sent/locked quote, create a new quote version instead. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, but NOT BOTH.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'The ID of the job',
      },
      quoteId: {
        type: 'number',
        description: 'The ID of the quote to update',
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections containing line items. WARNING: This array REPLACES ALL existing sections - you must include ALL sections (both modified and unmodified) or data will be lost. Use get-quote-detail first to fetch all existing sections.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Section name',
            },
            description: {
              type: 'string',
              description: 'Section description',
            },
            sortOrder: {
              type: 'number',
              description: 'Sort order for the section',
            },
            lineItems: {
              type: 'array',
              description: 'Line items in this section',
              items: {
                type: 'object',
                properties: {
                  itemName: {
                    type: 'string',
                    description: 'Name of the line item',
                  },
                  itemQuantity: {
                    type: 'number',
                    description: 'Quantity of the item (default: 1)',
                  },
                  itemPrice: {
                    type: 'number',
                    description: 'Price per unit',
                  },
                  itemCost: {
                    type: 'number',
                    description: 'Cost per unit (default: 0)',
                  },
                  salesAccountId: {
                    type: 'number',
                    description: 'Sales account ID (use EITHER this OR isLabour, not both)',
                  },
                  isLabour: {
                    type: 'boolean',
                    description: 'Whether this is a labour item (use EITHER this OR salesAccountId, not both)',
                  },
                  sortOrder: {
                    type: 'number',
                    description: 'Sort order for the line item',
                  },
                },
              },
            },
          },
        },
      },
    },
    required: ['jobId', 'quoteId', 'sections'],
  },
};

export async function handleUpdateQuote(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    quoteId: number;
    sections: any[];
  }
) {
  const { jobId, quoteId, sections } = args;

  try {
    // Fetch existing quote to preserve title and description
    // (API bug workaround: the DAO fails if title/description are undefined)
    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${quoteId}`);

    const requestBody = {
      title: existingQuote.data.title || '',
      description: existingQuote.data.description || null,
      sections,
    };

    const quote = await fergusClient.put(
      `/jobs/${jobId}/quotes/${quoteId}`,
      requestBody
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(quote, null, 2),
        },
      ],
    };
  } catch (error: any) {
    // Provide clearer error message for draft-only restriction
    if (error.message?.includes('must be a draft')) {
      throw new Error(
        `Cannot update quote ${quoteId}: The quote must be in DRAFT status to be updated. ` +
        `This quote has been sent, accepted, or locked. To make changes, create a new quote version using create-quote instead.`
      );
    }
    throw error;
  }
}

// ===== UPDATE QUOTE VERSION =====

export const updateQuoteVersionToolDefinition = {
  name: 'update-quote-version',
  description: 'Update an existing DRAFT quote by version number. WARNING: This operation REPLACES ALL EXISTING SECTIONS with the sections you provide. If you only want to modify one section, you MUST first fetch the quote using get-quote-detail to get ALL existing sections, then include ALL sections (both modified and unmodified) in your update. The quote must be in draft status (not sent, accepted, or locked) to be updated. To modify a sent/locked quote, create a new quote version instead. IMPORTANT: Line items must include EITHER isLabour OR salesAccountId, but NOT BOTH.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'The ID of the job',
      },
      versionNumber: {
        type: 'number',
        description: 'The version number of the quote to update',
      },
      sections: {
        type: 'array',
        description: 'Array of quote sections containing line items. WARNING: This array REPLACES ALL existing sections - you must include ALL sections (both modified and unmodified) or data will be lost. Use get-quote-detail first to fetch all existing sections.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Section name',
            },
            description: {
              type: 'string',
              description: 'Section description',
            },
            sortOrder: {
              type: 'number',
              description: 'Sort order for the section',
            },
            lineItems: {
              type: 'array',
              description: 'Line items in this section',
              items: {
                type: 'object',
                properties: {
                  itemName: {
                    type: 'string',
                    description: 'Name of the line item',
                  },
                  itemQuantity: {
                    type: 'number',
                    description: 'Quantity of the item (default: 1)',
                  },
                  itemPrice: {
                    type: 'number',
                    description: 'Price per unit',
                  },
                  itemCost: {
                    type: 'number',
                    description: 'Cost per unit (default: 0)',
                  },
                  salesAccountId: {
                    type: 'number',
                    description: 'Sales account ID (use EITHER this OR isLabour, not both)',
                  },
                  isLabour: {
                    type: 'boolean',
                    description: 'Whether this is a labour item (use EITHER this OR salesAccountId, not both)',
                  },
                  sortOrder: {
                    type: 'number',
                    description: 'Sort order for the line item',
                  },
                },
              },
            },
          },
        },
      },
    },
    required: ['jobId', 'versionNumber', 'sections'],
  },
};

export async function handleUpdateQuoteVersion(
  fergusClient: FergusClient,
  args: {
    jobId: number;
    versionNumber: number;
    sections: any[];
  }
) {
  const { jobId, versionNumber, sections } = args;

  try {
    // First, fetch all quotes for the job to find the one with matching version number
    const quotesResponse: any = await fergusClient.get(`/jobs/${jobId}/quotes`);
    const targetQuote = quotesResponse.data.find((q: any) => q.versionNumber === versionNumber);

    if (!targetQuote) {
      throw new Error(`Quote version ${versionNumber} not found for job ${jobId}`);
    }

    // Fetch the full quote details to preserve title and description
    // (API bug workaround: the DAO fails if title/description are undefined)
    const existingQuote: any = await fergusClient.get(`/jobs/${jobId}/quotes/${targetQuote.id}`);

    const requestBody = {
      title: existingQuote.data.title || '',
      description: existingQuote.data.description || null,
      sections,
    };

    const quote = await fergusClient.put(
      `/jobs/${jobId}/quotes/version/${versionNumber}`,
      requestBody
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(quote, null, 2),
        },
      ],
    };
  } catch (error: any) {
    // Provide clearer error message for draft-only restriction
    if (error.message?.includes('must be a draft')) {
      throw new Error(
        `Cannot update quote version ${versionNumber}: The quote must be in DRAFT status to be updated. ` +
        `This quote has been sent, accepted, or locked. To make changes, create a new quote version using create-quote instead.`
      );
    }
    throw error;
  }
}
