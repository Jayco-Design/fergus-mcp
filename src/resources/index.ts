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

Read this before write operations that target Fergus jobs or quotes.

## Job updates
- Fergus currently rejects partial \`PUT /jobs/{jobId}\` updates unless \`title\` and \`jobType\` are present.
- This MCP wrapper reads the current job first and preserves those fields when the caller omits them.
- Fergus job read and write models are inconsistent: job reads may expose the write-model title under \`description\`.
- Job updates are intended for draft jobs. If a non-draft job rejects an update, verify its current status before retrying.

## Quote updates
- Quote updates replace the entire \`sections\` array. Always send the full intended section set, not just a partial delta.
- The wrapper preserves existing quote \`title\` and \`description\` before update because Fergus is strict about those payloads.
- Quote update and quote version update operations only work on draft quotes.

## Quote acceptance and totals
- Quote acceptance uses the global endpoint \`/jobs/quotes/{quoteId}/accept\`, not the job-scoped quote endpoint.
- Quote totals uses the global endpoint \`/jobs/quotes/{quoteId}/totals\`.
- \`acceptedBy\` is required for quote acceptance.
- \`selectedSectionIds\` may be required when accepting or totaling quotes with optional or multi-select sections.

## Time entries
- The published Fergus API currently documents list/search for time entries, but not a dedicated get-by-id endpoint.

## Error handling
- Fergus sometimes returns validation failures as HTTP 500 responses with a structured error body.
- This MCP server forwards the Fergus HTTP status and upstream response body back to the caller so agents can react to the real validation message.
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
    description: 'Write-safety notes and wrapper behavior details for Fergus jobs, quotes, and errors',
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
