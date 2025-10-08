/**
 * Site Tools
 * All site-related operations (get, list, create, update)
 */

import { FergusClient } from '../fergus-client.js';
import { addressSchema, contactSchema } from './schemas.js';

// ===== GET SITE =====

export const getSiteToolDefinition = {
  name: 'get-site',
  description: 'Get details of a specific site by ID',
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'string',
        description: 'The ID of the site to retrieve',
      },
    },
    required: ['siteId'],
  },
};

export async function handleGetSite(
  fergusClient: FergusClient,
  args: { siteId: string }
) {
  const { siteId } = args;

  if (!siteId) {
    throw new Error('siteId is required');
  }

  const site = await fergusClient.get(`/sites/${siteId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(site, null, 2),
      },
    ],
  };
}

// ===== LIST SITES =====

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

// ===== CREATE SITE =====

export const createSiteToolDefinition = {
  name: 'create-site',
  description: 'Create a new site with required defaultContact and siteAddress.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Site name (optional)',
      },
      defaultContact: {
        ...contactSchema,
        description: 'Default contact for the site (required)',
        required: ['firstName'],
      },
      billingContact: {
        ...contactSchema,
        description: 'Billing contact for the site (optional)',
      },
      siteAddress: {
        ...addressSchema,
        description: 'Physical address of the site (required)',
      },
      postalAddress: {
        ...addressSchema,
        description: 'Postal address (optional, same structure as siteAddress)',
      },
    },
    required: ['defaultContact', 'siteAddress'],
  },
};

export async function handleCreateSite(
  fergusClient: FergusClient,
  args: {
    name?: string;
    defaultContact: {
      firstName: string;
      lastName?: string;
      position?: string;
      company?: string;
      contactItems?: Array<{
        contactType: 'email' | 'phone' | 'mobile' | 'other' | 'fax' | 'website';
        contactValue: string;
      }>;
    };
    billingContact?: any;
    siteAddress: any;
    postalAddress?: any;
  }
) {
  const { name, defaultContact, billingContact, siteAddress, postalAddress } = args;

  const requestBody: any = {
    defaultContact,
    siteAddress,
  };

  if (name) {
    requestBody.name = name;
  }

  if (billingContact) {
    requestBody.billingContact = billingContact;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const site = await fergusClient.post('/sites', requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(site, null, 2),
      },
    ],
  };
}

// ===== UPDATE SITE =====

export const updateSiteToolDefinition = {
  name: 'update-site',
  description: 'Update an existing site. Requires siteId and siteAddress.',
  inputSchema: {
    type: 'object',
    properties: {
      siteId: {
        type: 'number',
        description: 'The ID of the site to update',
      },
      name: {
        type: 'string',
        description: 'Site name (optional)',
      },
      siteAddress: {
        ...addressSchema,
        description: 'Physical address of the site (required)',
      },
      postalAddress: {
        ...addressSchema,
        description: 'Postal address (optional, same structure as siteAddress)',
      },
    },
    required: ['siteId', 'siteAddress'],
  },
};

export async function handleUpdateSite(
  fergusClient: FergusClient,
  args: {
    siteId: number;
    name?: string;
    siteAddress: any;
    postalAddress?: any;
  }
) {
  const { siteId, name, siteAddress, postalAddress } = args;

  const requestBody: any = {
    siteAddress,
  };

  if (name) {
    requestBody.name = name;
  }

  if (postalAddress) {
    requestBody.postalAddress = postalAddress;
  }

  const site = await fergusClient.patch(`/sites/${siteId}`, requestBody);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(site, null, 2),
      },
    ],
  };
}
