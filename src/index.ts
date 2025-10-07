#!/usr/bin/env node

/**
 * Fergus MCP Server
 * Model Context Protocol server for the Fergus API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { FergusClient } from './fergus-client.js';

// Tool handlers
import { getJobToolDefinition, handleGetJob } from './tools/get-job.js';
import { listJobsToolDefinition, handleListJobs } from './tools/list-jobs.js';
import { getTimeEntryToolDefinition, handleGetTimeEntry } from './tools/get-time-entry.js';
import { listTimeEntriesToolDefinition, handleListTimeEntries } from './tools/list-time-entries.js';
import { getQuoteToolDefinition, handleGetQuote } from './tools/get-quote.js';
import { listQuotesToolDefinition, handleListQuotes } from './tools/list-quotes.js';
import { getCustomerToolDefinition, handleGetCustomer } from './tools/get-customer.js';
import { listCustomersToolDefinition, handleListCustomers } from './tools/list-customers.js';
import { getSiteToolDefinition, handleGetSite } from './tools/get-site.js';
import { listSitesToolDefinition, handleListSites } from './tools/list-sites.js';
import { getUserToolDefinition, handleGetUser } from './tools/get-user.js';
import { listUsersToolDefinition, handleListUsers } from './tools/list-users.js';
import { createJobToolDefinition, handleCreateJob } from './tools/create-job.js';
import { updateJobToolDefinition, handleUpdateJob } from './tools/update-job.js';
import { finalizeJobToolDefinition, handleFinalizeJob } from './tools/finalize-job.js';
import { createQuoteToolDefinition, handleCreateQuote } from './tools/create-quote.js';
import { updateQuoteToolDefinition, handleUpdateQuote } from './tools/update-quote.js';
import { createCustomerToolDefinition, handleCreateCustomer } from './tools/create-customer.js';
import { updateCustomerToolDefinition, handleUpdateCustomer } from './tools/update-customer.js';
import { createSiteToolDefinition, handleCreateSite } from './tools/create-site.js';
import { updateSiteToolDefinition, handleUpdateSite } from './tools/update-site.js';

/**
 * Main server setup
 */
async function main() {
  // Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  // Initialize Fergus API client
  const fergusClient = new FergusClient({
    apiToken: config.fergusApiToken,
    baseUrl: config.fergusBaseUrl,
  });

  // Verify API connection
  const isHealthy = await fergusClient.healthCheck();
  if (!isHealthy) {
    console.error('Failed to connect to Fergus API. Please check your API token and network connection.');
    process.exit(1);
  }

  // Create MCP server
  const server = new Server(
    {
      name: 'fergus-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * Handler for listing available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        getJobToolDefinition,
        listJobsToolDefinition,
        getTimeEntryToolDefinition,
        listTimeEntriesToolDefinition,
        getQuoteToolDefinition,
        listQuotesToolDefinition,
        getCustomerToolDefinition,
        listCustomersToolDefinition,
        getSiteToolDefinition,
        listSitesToolDefinition,
        getUserToolDefinition,
        listUsersToolDefinition,
        createJobToolDefinition,
        updateJobToolDefinition,
        finalizeJobToolDefinition,
        createQuoteToolDefinition,
        updateQuoteToolDefinition,
        createCustomerToolDefinition,
        updateCustomerToolDefinition,
        createSiteToolDefinition,
        updateSiteToolDefinition,
      ],
    };
  });

  /**
   * Handler for tool execution
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get-job':
          return await handleGetJob(fergusClient, args as { jobId?: string });

        case 'list-jobs':
          return await handleListJobs(fergusClient, args as { status?: string; limit?: number; sortField?: string; sortOrder?: string });

        case 'get-time-entry':
          return await handleGetTimeEntry(fergusClient, args as { timeEntryId: string });

        case 'list-time-entries':
          return await handleListTimeEntries(fergusClient, args as {
            filterUserId?: string;
            filterJobNo?: string;
            filterDateFrom?: string;
            filterDateTo?: string;
            filterSearchText?: string;
            filterLockedOnly?: boolean;
            pageSize?: number;
            sortField?: string;
            sortOrder?: string;
            pageCursor?: string;
          });

        case 'get-quote':
          return await handleGetQuote(fergusClient, args as { quoteId: string });

        case 'list-quotes':
          return await handleListQuotes(fergusClient, args as {
            filterStatus?: string;
            createdAfter?: string;
            modifiedAfter?: string;
            pageSize?: number;
            sortField?: string;
            sortOrder?: string;
            pageCursor?: string;
          });

        case 'get-customer':
          return await handleGetCustomer(fergusClient, args as { customerId: string });

        case 'list-customers':
          return await handleListCustomers(fergusClient, args as {
            filterSearchText?: string;
            pageSize?: number;
            sortField?: string;
            sortOrder?: string;
            pageCursor?: string;
          });

        case 'get-site':
          return await handleGetSite(fergusClient, args as { siteId: string });

        case 'list-sites':
          return await handleListSites(fergusClient, args as {
            filterSearchText?: string;
            filterSiteName?: string;
            filterAddressCity?: string;
            filterAddressPostalCode?: string;
            pageSize?: number;
            sortField?: string;
            sortOrder?: string;
            pageCursor?: string;
          });

        case 'get-user':
          return await handleGetUser(fergusClient, args as { userId: string });

        case 'list-users':
          return await handleListUsers(fergusClient, args as {
            filterSearchText?: string;
            pageSize?: number;
            sortField?: string;
            sortOrder?: string;
            filterUserType?: string;
            filterStatus?: string;
          });

        case 'create-job':
          return await handleCreateJob(fergusClient, args as {
            jobType: 'Quote' | 'Estimate' | 'Charge Up';
            title: string;
            description?: string;
            customerId?: number;
            siteId?: number;
            customerReference?: string;
            isDraft?: boolean;
          });

        case 'update-job':
          return await handleUpdateJob(fergusClient, args as {
            jobId: number;
            title?: string;
            description?: string;
            customerId?: number;
            siteId?: number;
            customerReference?: string;
          });

        case 'finalize-job':
          return await handleFinalizeJob(fergusClient, args as { jobId: number });

        case 'create-quote':
          return await handleCreateQuote(fergusClient, args as {
            jobId: number;
            title: string;
            description?: string;
            dueDays: number;
            sections: any[];
          });

        case 'update-quote':
          return await handleUpdateQuote(fergusClient, args as {
            jobId: number;
            quoteId: number;
            sections: any[];
          });

        case 'create-customer':
          return await handleCreateCustomer(fergusClient, args as {
            customerFullName: string;
            mainContact: any;
            physicalAddress?: any;
            postalAddress?: any;
          });

        case 'update-customer':
          return await handleUpdateCustomer(fergusClient, args as {
            customerId: number;
            customerFullName: string;
            mainContact: any;
            physicalAddress?: any;
            postalAddress?: any;
          });

        case 'create-site':
          return await handleCreateSite(fergusClient, args as {
            name?: string;
            defaultContact: any;
            billingContact?: any;
            siteAddress: any;
            postalAddress?: any;
          });

        case 'update-site':
          return await handleUpdateSite(fergusClient, args as {
            siteId: number;
            name?: string;
            siteAddress: any;
            postalAddress?: any;
          });

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
