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
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { FergusClient } from './fergus-client.js';

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
        resources: {},
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
        {
          name: 'get-job',
          description: 'Get details for a specific job by ID',
          inputSchema: {
            type: 'object',
            properties: {
              jobId: {
                type: 'string',
                description: 'The ID of the job to retrieve',
              },
            },
            required: ['jobId'],
          },
        },
        {
          name: 'list-jobs',
          description: 'List all jobs with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                description: 'Filter by job status (e.g., active, completed)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of jobs to return',
                default: 50,
              },
            },
          },
        },
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
        case 'get-job': {
          const jobId = args?.jobId as string;
          if (!jobId) {
            throw new Error('jobId is required');
          }
          const job = await fergusClient.get(`/jobs/${jobId}`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(job, null, 2),
              },
            ],
          };
        }

        case 'list-jobs': {
          const status = args?.status as string | undefined;
          const limit = (args?.limit as number) || 50;

          let endpoint = `/jobs?limit=${limit}`;
          if (status) {
            endpoint += `&status=${encodeURIComponent(status)}`;
          }

          const jobs = await fergusClient.get(endpoint);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(jobs, null, 2),
              },
            ],
          };
        }

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

  /**
   * Handler for listing available resources
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'fergus://jobs',
          name: 'All Jobs',
          description: 'List of all jobs in Fergus',
          mimeType: 'application/json',
        },
        {
          uri: 'fergus://customers',
          name: 'All Customers',
          description: 'List of all customers in Fergus',
          mimeType: 'application/json',
        },
      ],
    };
  });

  /**
   * Handler for reading resources
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      switch (uri) {
        case 'fergus://jobs': {
          const jobs = await fergusClient.get('/jobs');
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(jobs, null, 2),
              },
            ],
          };
        }

        case 'fergus://customers': {
          const customers = await fergusClient.get('/customers');
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(customers, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to read resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Fergus MCP Server running on stdio');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
