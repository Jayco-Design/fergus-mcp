/**
 * MCP Resources
 * Serves UI templates and static Fergus behavior notes to MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const KNOWN_FERGUS_QUIRKS_URI = 'docs://fergus/known-quirks.md';

type ResourceDefinition = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  filePath?: string;
  text?: string;
};

const KNOWN_FERGUS_QUIRKS_TEXT = `# Known Fergus Quirks

This resource is supplemental context only.
The primary contract for MCP callers is the tool schema, the action descriptions, and the returned error messages.
Use this document for extra background and troubleshooting.

## Job model mismatch
- Fergus job reads and writes are not perfectly aligned.
- In practice, a job GET can expose the write-model title under \`description\`.
- The MCP wrapper compensates for that mismatch during job updates.

## Quote payload preservation
- The wrapper preserves current quote \`title\` and \`description\` during update flows because Fergus is strict about those payloads.
- Quote updates still replace the full \`sections\` array.

## Validation failures may look like server failures
- Fergus sometimes reports validation failures as HTTP 500 responses with a structured JSON error body.
- This MCP server forwards the HTTP status and upstream response body so callers can react to the actual validation message.

## Time entries
- The published Fergus API currently documents list/search for time entries, but not a dedicated get-by-id endpoint.
`;

const RESOURCES: ResourceDefinition[] = [
  {
    uri: 'ui://customers/list-customers.html',
    name: 'Customer List Template',
    description: 'Table view of customers with contact and location information',
    mimeType: 'text/html',
    filePath: '../templates/customers/list-customers.html',
  },
  {
    uri: 'ui://customers/customer-detail.html',
    name: 'Customer Detail Template',
    description: 'Detailed view of a single customer with full contact and address information',
    mimeType: 'text/html',
    filePath: '../templates/customers/customer-detail.html',
  },
  {
    uri: 'ui://shared/styles.css',
    name: 'Shared Styles',
    description: 'Common CSS styles for all templates',
    mimeType: 'text/css',
    filePath: '../templates/shared/styles.css',
  },
  {
    uri: KNOWN_FERGUS_QUIRKS_URI,
    name: 'Known Fergus Quirks',
    description: 'Supplemental background and troubleshooting notes for Fergus wrapper behavior',
    mimeType: 'text/markdown',
    text: KNOWN_FERGUS_QUIRKS_TEXT,
  },
];

export function registerResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: RESOURCES.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const resource = RESOURCES.find(candidate => candidate.uri === uri);

    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    if (resource.text !== undefined) {
      return {
        contents: [{
          uri,
          mimeType: resource.mimeType,
          text: resource.text,
        }],
      };
    }

    if (!resource.filePath) {
      throw new Error(`Resource has no content source: ${uri}`);
    }

    const filePath = path.join(__dirname, resource.filePath);
    const content = await fs.readFile(filePath, 'utf-8');

    return {
      contents: [{
        uri,
        mimeType: resource.mimeType,
        text: content,
      }],
    };
  });
}
