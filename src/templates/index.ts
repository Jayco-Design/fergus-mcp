/**
 * MCP Resources for Templates
 * Serves HTML templates to ChatGPT Apps
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Template definitions
 */
const TEMPLATES = [
  {
    uri: 'ui://customers/list-customers.html',
    name: 'Customer List Template',
    description: 'Table view of customers with contact and location information',
    mimeType: 'text/html',
    filePath: 'customers/list-customers.html',
  },
  {
    uri: 'ui://customers/customer-detail.html',
    name: 'Customer Detail Template',
    description: 'Detailed view of a single customer with full contact and address information',
    mimeType: 'text/html',
    filePath: 'customers/customer-detail.html',
  },
  {
    uri: 'ui://shared/styles.css',
    name: 'Shared Styles',
    description: 'Common CSS styles for all templates',
    mimeType: 'text/css',
    filePath: 'shared/styles.css',
  },
];

/**
 * Register template resources with the MCP server
 */
export function registerTemplateResources(server: Server): void {
  /**
   * List all available templates
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    console.error('[Resources] Listing available templates');

    return {
      resources: TEMPLATES.map(template => ({
        uri: template.uri,
        name: template.name,
        description: template.description,
        mimeType: template.mimeType,
      })),
    };
  });

  /**
   * Read template content
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    console.error(`[Resources] Reading template: ${uri}`);

    // Find the template definition
    const template = TEMPLATES.find(t => t.uri === uri);

    if (!template) {
      throw new Error(`Template not found: ${uri}`);
    }

    try {
      // Read the file from disk
      const filePath = path.join(__dirname, template.filePath);
      const content = await fs.readFile(filePath, 'utf-8');

      console.error(`[Resources] Successfully read template: ${uri} (${content.length} bytes)`);

      return {
        contents: [{
          uri,
          mimeType: template.mimeType,
          text: content,
        }],
      };
    } catch (error) {
      console.error(`[Resources] Error reading template ${uri}:`, error);
      throw new Error(`Failed to read template: ${uri}`);
    }
  });

  console.error('[Resources] Template resources registered');
}
