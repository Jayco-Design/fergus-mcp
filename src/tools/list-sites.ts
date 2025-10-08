/**
 * List Sites Tool
 * Lists sites with optional search and filtering
 */

import { FergusClient } from '../fergus-client.js';

export const listSitesToolDefinition = {
  name: 'list-sites',
  description: 'List sites with optional search and filtering',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter sites',
      },
      filterSiteName: {
        type: 'string',
        description: 'Filter by site name',
      },
      filterAddressCity: {
        type: 'string',
        description: 'Filter by city',
      },
      filterAddressPostalCode: {
        type: 'string',
        description: 'Filter by postal code',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of sites to return per page',
        default: 10,
      },
      sortField: {
        type: 'string',
        description: 'Field to sort by',
        default: 'name',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor for next page',
        default: '0',
      },
    },
  },
};

export async function handleListSites(
  fergusClient: FergusClient,
  args: {
    filterSearchText?: string;
    filterSiteName?: string;
    filterAddressCity?: string;
    filterAddressPostalCode?: string;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    pageCursor?: string;
  }
) {
  const {
    filterSearchText,
    filterSiteName,
    filterAddressCity,
    filterAddressPostalCode,
    pageSize = 10,
    sortField = 'name',
    sortOrder = 'asc',
    pageCursor = '0',
  } = args || {};

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);

  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterSiteName) params.append('filterSiteName', filterSiteName);
  if (filterAddressCity) params.append('filterAddressCity', filterAddressCity);
  if (filterAddressPostalCode) params.append('filterAddressPostalCode', filterAddressPostalCode);

  const endpoint = `/sites?${params.toString()}`;
  const response = await fergusClient.get(endpoint) as any;

  // Extract sites array from response
  const sites = Array.isArray(response) ? response : (response.data || response.sites || []);
  const totalCount = response.total || response.totalCount || sites.length;
  const nextCursor = response.nextCursor || response.pageCursor || null;

  // Create a concise text summary
  const summary = `Found ${sites.length} site(s)${totalCount > sites.length ? ` of ${totalCount} total` : ''}`;

  // Structure the data for better ChatGPT consumption
  const structuredSites = sites.map((site: any) => ({
    id: site.id || site.siteId,
    name: site.name,
    address: {
      line1: site.siteAddress?.line1 || site.address?.line1,
      city: site.siteAddress?.city || site.address?.city,
      postalCode: site.siteAddress?.postalCode || site.address?.postalCode,
      country: site.siteAddress?.country || site.address?.country,
    },
    defaultContact: site.defaultContact ? {
      name: site.defaultContact.name,
      email: site.defaultContact.email,
      phone: site.defaultContact.phone,
    } : null,
  }));

  return {
    content: [
      {
        type: 'text' as const,
        text: `${summary}\n\n${JSON.stringify(structuredSites, null, 2)}`,
      },
    ],
    // Structured content for ChatGPT Apps to consume
    structuredContent: {
      sites: structuredSites,
      pagination: {
        count: sites.length,
        total: totalCount,
        nextCursor,
      },
    },
  };
}
