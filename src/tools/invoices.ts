/**
 * Customer Invoice Tools
 * manage-invoices: get, list
 */

import { FergusClient } from '../fergus-client.js';

export const manageInvoicesToolDefinition = {
  name: 'manage-invoices',
  description: 'Manage customer invoices. Actions: get, list',
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
      customerId: {
        type: 'number',
        description: 'Filter by customer ID (for: list)',
      },
      jobId: {
        type: 'number',
        description: 'Filter by job ID (for: list)',
      },
      invoiceNumber: {
        type: 'string',
        description: 'Search by invoice number (for: list)',
      },
      dueBefore: {
        type: 'string',
        description: 'Filter invoices due before this ISO 8601 datetime (for: list)',
      },
      dueAfter: {
        type: 'string',
        description: 'Filter invoices due after this ISO 8601 datetime (for: list)',
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

  const invoice = await fergusClient.get(`/customerInvoices/${invoiceId}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(invoice, null, 2) }] };
}

async function handleListInvoices(fergusClient: FergusClient, args: Record<string, any>) {
  const { customerId, jobId, invoiceNumber, dueBefore, dueAfter, pageSize = 50, sortField, sortOrder, pageCursor } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  if (customerId !== undefined) params.append('customerId', customerId.toString());
  if (jobId !== undefined) params.append('jobId', jobId.toString());
  if (invoiceNumber) params.append('invoiceNumber', invoiceNumber);
  if (dueBefore) params.append('dueBefore', dueBefore);
  if (dueAfter) params.append('dueAfter', dueAfter);
  if (sortField) params.append('sortField', sortField);
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (pageCursor) params.append('pageCursor', pageCursor);

  const invoices = await fergusClient.get(`/customerInvoices?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(invoices, null, 2) }] };
}
