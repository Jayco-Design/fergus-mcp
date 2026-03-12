/**
 * Invoice Tools
 * manage-invoices: get, list
 */

import { FergusClient } from '../fergus-client.js';

export const manageInvoicesToolDefinition = {
  name: 'manage-invoices',
  description: 'Manage invoices. Actions: get, list',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list'],
        description: 'The action to perform',
      },
      invoiceId: {
        type: 'string',
        description: 'Invoice ID (required for: get)',
      },
      filterStatus: {
        type: 'string',
        description: 'Filter by invoice status (for: list)',
      },
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter invoices (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by (for: list)',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageInvoices(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetInvoice(fergusClient, args);
    case 'list':
      return handleListInvoices(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list`);
  }
}

async function handleGetInvoice(fergusClient: FergusClient, args: Record<string, any>) {
  const { invoiceId } = args;
  if (!invoiceId) throw new Error('invoiceId is required for get action');

  const invoice = await fergusClient.get(`/invoices/${invoiceId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(invoice, null, 2) }] };
}

async function handleListInvoices(fergusClient: FergusClient, args: Record<string, any>) {
  const { filterStatus, filterSearchText, pageSize = 50, sortField, sortOrder, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (filterStatus) params.append('filterStatus', filterStatus);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const invoices = await fergusClient.get(`/invoices?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(invoices, null, 2) }] };
}
