/**
 * Shared MCP server setup
 * Used by both stdio and HTTP transports
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from './fergus-client.js';

// Tool handlers - consolidated imports
import {
  getCustomerToolDefinition,
  listCustomersToolDefinition,
  createCustomerToolDefinition,
  updateCustomerToolDefinition,
  handleGetCustomer,
  handleListCustomers,
  handleCreateCustomer,
  handleUpdateCustomer,
} from './tools/customers.js';

import {
  getSiteToolDefinition,
  listSitesToolDefinition,
  createSiteToolDefinition,
  updateSiteToolDefinition,
  handleGetSite,
  handleListSites,
  handleCreateSite,
  handleUpdateSite,
} from './tools/sites.js';

import {
  getJobToolDefinition,
  listJobsToolDefinition,
  createJobToolDefinition,
  updateJobToolDefinition,
  finalizeJobToolDefinition,
  handleGetJob,
  handleListJobs,
  handleCreateJob,
  handleUpdateJob,
  handleFinalizeJob,
} from './tools/jobs.js';

import {
  getQuoteToolDefinition,
  getQuoteDetailToolDefinition,
  listQuotesToolDefinition,
  createQuoteToolDefinition,
  updateQuoteToolDefinition,
  updateQuoteVersionToolDefinition,
  handleGetQuote,
  handleGetQuoteDetail,
  handleListQuotes,
  handleCreateQuote,
  handleUpdateQuote,
  handleUpdateQuoteVersion,
} from './tools/quotes.js';

import {
  getUserToolDefinition,
  listUsersToolDefinition,
  updateUserToolDefinition,
  handleGetUser,
  handleListUsers,
  handleUpdateUser,
} from './tools/users.js';

import {
  getTimeEntryToolDefinition,
  listTimeEntriesToolDefinition,
  handleGetTimeEntry,
  handleListTimeEntries,
} from './tools/time-entries.js';

// Prompt handlers
import { jobCreationAssistantPromptDefinition, getJobCreationAssistantPrompt } from './prompts/job-creation-assistant.js';
import { quoteGeneratorPromptDefinition, getQuoteGeneratorPrompt } from './prompts/quote-generator.js';
// import { weeklyReportPromptDefinition, getWeeklyReportPrompt } from './prompts/weekly-report.js';
import { quoteDetailFinderPromptDefinition, getQuoteDetailFinderPrompt } from './prompts/quote-detail-finder.js';
import { jobProgressSnapshotPromptDefinition, getJobProgressSnapshotPrompt } from './prompts/job-progress-snapshot.js';
import { revenuePipelineSummaryPromptDefinition, getRevenuePipelineSummaryPrompt } from './prompts/revenue-pipeline-summary.js';

// Template resources
import { registerTemplateResources } from './templates/index.js';

/**
 * Create and configure an MCP server with all tools and prompts
 * @param fergusClient - Configured FergusClient instance
 * @returns Configured Server instance ready to connect to a transport
 */
export function createMcpServer(fergusClient: FergusClient): Server {
  // Create MCP server
  const server = new Server(
    {
      name: 'fergus-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {}, // Enable resources for ChatGPT App templates
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
        getQuoteDetailToolDefinition,
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
        updateQuoteVersionToolDefinition,
        createCustomerToolDefinition,
        updateCustomerToolDefinition,
        createSiteToolDefinition,
        updateSiteToolDefinition,
        updateUserToolDefinition,
      ],
    };
  });

  /**
   * Handler for listing available prompts
   */
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        jobCreationAssistantPromptDefinition,
        quoteGeneratorPromptDefinition,
        // weeklyReportPromptDefinition,
        quoteDetailFinderPromptDefinition,
        jobProgressSnapshotPromptDefinition,
        revenuePipelineSummaryPromptDefinition,
      ],
    };
  });

  /**
   * Handler for getting a specific prompt
   */
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'job-creation-assistant':
        return getJobCreationAssistantPrompt(args as { jobType?: string });

      case 'quote-generator':
        if (!args?.jobId) {
          throw new Error('jobId is required for quote-generator prompt');
        }
        return getQuoteGeneratorPrompt(args as { jobId: string });

      // case 'weekly-report':
      //   return getWeeklyReportPrompt(args as { dateFrom?: string; dateTo?: string });

      case 'quote-detail-finder':
        if (!args?.searchTerm) {
          throw new Error('searchTerm is required for quote-detail-finder prompt');
        }
        return getQuoteDetailFinderPrompt(args as { searchTerm: string });

      case 'job-progress-snapshot':
        if (!args?.jobRef) {
          throw new Error('jobRef is required for job-progress-snapshot prompt');
        }
        return getJobProgressSnapshotPrompt(args as { jobRef: string });

      case 'revenue-pipeline-summary':
        return getRevenuePipelineSummaryPrompt(args as { dateFrom?: string; dateTo?: string });

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  /**
   * Handler for tool execution
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args, _meta } = request.params;

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

        case 'get-quote-detail':
          return await handleGetQuoteDetail(fergusClient, args as { jobId: string; quoteId: string });

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
          return await handleGetCustomer(fergusClient, args as { customerId: string }, _meta);

        case 'list-customers':
          return await handleListCustomers(fergusClient, args as {
            filterSearchText?: string;
            pageSize?: number;
            sortField?: string;
            sortOrder?: string;
            pageCursor?: string;
          }, _meta);

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
          }, _meta);

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

        case 'update-quote-version':
          return await handleUpdateQuoteVersion(fergusClient, args as {
            jobId: number;
            versionNumber: number;
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

        case 'update-user':
          return await handleUpdateUser(fergusClient, args as {
            userId: number;
            firstName?: string;
            lastName?: string;
            address?: any;
            payRate?: number;
            chargeOutRate?: number;
            contactItems?: any[];
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

  // Register template resources for ChatGPT Apps
  registerTemplateResources(server);

  return server;
}
