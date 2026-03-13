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
import { FergusAPIError, FergusClient } from './fergus-client.js';

// Tool handlers - consolidated imports
import { manageJobsToolDefinition, handleManageJobs } from './tools/jobs.js';
import { manageQuotesToolDefinition, handleManageQuotes } from './tools/quotes.js';
import { manageCustomersToolDefinition, handleManageCustomers } from './tools/customers.js';
import { manageSitesToolDefinition, handleManageSites } from './tools/sites.js';
import { manageUsersToolDefinition, handleManageUsers } from './tools/users.js';
import { manageTimeEntriesToolDefinition, handleManageTimeEntries } from './tools/time-entries.js';
import { manageContactsToolDefinition, handleManageContacts } from './tools/contacts.js';
import { manageInvoicesToolDefinition, handleManageInvoices } from './tools/invoices.js';
import { manageEnquiriesToolDefinition, handleManageEnquiries } from './tools/enquiries.js';
import { managePricebooksToolDefinition, handleManagePricebooks } from './tools/pricebooks.js';
import { manageStockToolDefinition, handleManageStock } from './tools/stock.js';
import { manageCalendarEventsToolDefinition, handleManageCalendarEvents } from './tools/calendar-events.js';
import { manageNotesToolDefinition, handleManageNotes } from './tools/notes.js';
import { managePricingTiersToolDefinition, handleManagePricingTiers } from './tools/pricing-tiers.js';
import { manageFavouritesToolDefinition, handleManageFavourites } from './tools/favourites.js';
import { getCompanyInfoToolDefinition, handleGetCompanyInfo } from './tools/company.js';

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
function formatErrorDetails(error: unknown): string {
  if (error instanceof FergusAPIError) {
    const parts = [error.message];

    if (error.statusCode !== undefined) {
      parts.push(`HTTP status: ${error.statusCode}`);
    }

    if (error.response !== undefined && error.response !== null && error.response !== '') {
      if (typeof error.response === 'string') {
        parts.push(`Upstream response: ${error.response}`);
      } else {
        parts.push(`Upstream response: ${JSON.stringify(error.response, null, 2)}`);
      }
    }

    return parts.join('\n');
  }

  return error instanceof Error ? error.message : 'Unknown error';
}

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
        manageJobsToolDefinition,
        manageQuotesToolDefinition,
        manageCustomersToolDefinition,
        manageSitesToolDefinition,
        manageContactsToolDefinition,
        manageUsersToolDefinition,
        manageInvoicesToolDefinition,
        manageEnquiriesToolDefinition,
        manageTimeEntriesToolDefinition,
        managePricebooksToolDefinition,
        manageStockToolDefinition,
        manageCalendarEventsToolDefinition,
        manageNotesToolDefinition,
        managePricingTiersToolDefinition,
        manageFavouritesToolDefinition,
        getCompanyInfoToolDefinition,
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
        case 'manage-jobs':
          return await handleManageJobs(fergusClient, args as Record<string, any>);

        case 'manage-quotes':
          return await handleManageQuotes(fergusClient, args as Record<string, any>);

        case 'manage-customers':
          return await handleManageCustomers(fergusClient, args as Record<string, any>, _meta);

        case 'manage-sites':
          return await handleManageSites(fergusClient, args as Record<string, any>);

        case 'manage-contacts':
          return await handleManageContacts(fergusClient, args as Record<string, any>);

        case 'manage-users':
          return await handleManageUsers(fergusClient, args as Record<string, any>, _meta);

        case 'manage-invoices':
          return await handleManageInvoices(fergusClient, args as Record<string, any>);

        case 'manage-enquiries':
          return await handleManageEnquiries(fergusClient, args as Record<string, any>);

        case 'manage-time-entries':
          return await handleManageTimeEntries(fergusClient, args as Record<string, any>);

        case 'manage-pricebooks':
          return await handleManagePricebooks(fergusClient, args as Record<string, any>);

        case 'manage-stock':
          return await handleManageStock(fergusClient, args as Record<string, any>);

        case 'manage-calendar-events':
          return await handleManageCalendarEvents(fergusClient, args as Record<string, any>);

        case 'manage-notes':
          return await handleManageNotes(fergusClient, args as Record<string, any>);

        case 'manage-pricing-tiers':
          return await handleManagePricingTiers(fergusClient, args as Record<string, any>);

        case 'manage-favourites':
          return await handleManageFavourites(fergusClient, args as Record<string, any>);

        case 'get-company-info':
          return await handleGetCompanyInfo(fergusClient);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${formatErrorDetails(error)}`,
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
