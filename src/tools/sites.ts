/**
 * Site Tools (consolidated)
 * manage-sites: get, list, create, update
 */

import { FergusClient } from '../fergus-client.js';
import { addressSchema, contactSchema } from './schemas.js';

export const manageSitesToolDefinition = {
  name: 'manage-sites',
  description: 'Manage sites. Actions: get, list, create, update, archive, restore',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'list', 'create', 'update', 'archive', 'restore'],
        description: 'The action to perform',
      },
      siteId: {
        type: 'string',
        description: 'Site ID (required for: get, update)',
      },
      // list params
      filterSearchText: {
        type: 'string',
        description: 'Search text to filter sites (for: list)',
      },
      filterSiteName: {
        type: 'string',
        description: 'Filter by site name (for: list)',
      },
      filterAddressCity: {
        type: 'string',
        description: 'Filter by city (for: list)',
      },
      filterAddressPostalCode: {
        type: 'string',
        description: 'Filter by postal code (for: list)',
      },
      pageSize: {
        type: 'number',
        description: 'Max results per page (for: list, default: 50)',
        default: 50,
      },
      sortField: {
        type: 'string',
        enum: ['name', 'createdAt'],
        description: 'Field to sort by (for: list, default: name)',
        default: 'name',
      },
      sortOrder: {
        type: 'string',
        description: 'Sort order: asc or desc (for: list)',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
      pageCursor: {
        type: 'string',
        description: 'Pagination cursor (for: list)',
        default: '0',
      },
      // create/update params
      name: {
        type: 'string',
        description: 'Site name (for: create, update)',
      },
      defaultContact: {
        ...contactSchema,
        description: 'Default contact for the site (required for: create)',
        required: ['firstName'],
      },
      billingContact: {
        ...contactSchema,
        description: 'Billing contact for the site (for: create)',
      },
      siteAddress: {
        ...addressSchema,
        description: 'Physical address of the site (required for: create, update)',
      },
      postalAddress: {
        ...addressSchema,
        description: 'Postal address (for: create, update)',
      },
    },
    required: ['action'],
  },
};

export async function handleManageSites(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  switch (args.action) {
    case 'get':
      return handleGetSite(fergusClient, args);
    case 'list':
      return handleListSites(fergusClient, args);
    case 'create':
      return handleCreateSite(fergusClient, args);
    case 'update':
      return handleUpdateSite(fergusClient, args);
    case 'archive':
      return handleArchiveSite(fergusClient, args);
    case 'restore':
      return handleRestoreSite(fergusClient, args);
    default:
      throw new Error(`Unknown action: ${args.action}. Valid actions: get, list, create, update, archive, restore`);
  }
}

// ===== GET SITE =====

async function handleGetSite(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { siteId } = args;
  if (!siteId) {
    throw new Error('siteId is required for get action');
  }

  const site = await fergusClient.get(`/sites/${siteId}`);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(site, null, 2) }],
  };
}

// ===== LIST SITES =====

async function handleListSites(
  fergusClient: FergusClient,
  args: Record<string, any>
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
  } = args;

  const params = new URLSearchParams();
  params.append('pageSize', pageSize.toString());
  params.append('sortField', sortField);
  params.append('sortOrder', sortOrder);
  params.append('pageCursor', pageCursor);
  if (filterSearchText) params.append('filterSearchText', filterSearchText);
  if (filterSiteName) params.append('filterSiteName', filterSiteName);
  if (filterAddressCity) params.append('filterAddressCity', filterAddressCity);
  if (filterAddressPostalCode) params.append('filterAddressPostalCode', filterAddressPostalCode);

  const response = await fergusClient.get(`/sites?${params.toString()}`) as any;
  const sites = Array.isArray(response) ? response : (response.data || response.sites || []);
  const totalCount = response.total || response.totalCount || sites.length;
  const nextCursor = response.nextCursor || response.pageCursor || null;

  const summary = `Found ${sites.length} site(s)${totalCount > sites.length ? ` of ${totalCount} total` : ''}`;

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
      { type: 'text' as const, text: `${summary}\n\n${JSON.stringify(structuredSites, null, 2)}` },
    ],
    structuredContent: {
      sites: structuredSites,
      pagination: { count: sites.length, total: totalCount, nextCursor },
    },
  };
}

// ===== CREATE SITE =====

async function handleCreateSite(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { name, defaultContact, billingContact, siteAddress, postalAddress } = args;
  if (!defaultContact || !siteAddress) {
    throw new Error('defaultContact and siteAddress are required for create action');
  }

  const requestBody: any = { defaultContact, siteAddress };
  if (name) requestBody.name = name;
  if (billingContact) requestBody.billingContact = billingContact;
  if (postalAddress) requestBody.postalAddress = postalAddress;

  const site = await fergusClient.post('/sites', requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(site, null, 2) }],
  };
}

// ===== UPDATE SITE =====

async function handleUpdateSite(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { siteId, name, siteAddress, postalAddress } = args;
  if (!siteId || !siteAddress) {
    throw new Error('siteId and siteAddress are required for update action');
  }

  const requestBody: any = { siteAddress };
  if (name) requestBody.name = name;
  if (postalAddress) requestBody.postalAddress = postalAddress;

  const site = await fergusClient.patch(`/sites/${siteId}`, requestBody);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(site, null, 2) }],
  };
}

// ===== ARCHIVE SITE =====

async function handleArchiveSite(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { siteId } = args;
  if (!siteId) throw new Error('siteId is required for archive action');

  const result = await fergusClient.post(`/sites/${siteId}/archive`, {});
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

// ===== RESTORE SITE =====

async function handleRestoreSite(
  fergusClient: FergusClient,
  args: Record<string, any>
) {
  const { siteId } = args;
  if (!siteId) throw new Error('siteId is required for restore action');

  const result = await fergusClient.post(`/sites/${siteId}/restore`, {});
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
