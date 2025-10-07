/**
 * Get User Tool
 * Retrieves a specific user by ID
 */

import { FergusClient } from '../fergus-client.js';

export const getUserToolDefinition = {
  name: 'get-user',
  description: 'Get details of a specific user by ID',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The ID of the user to retrieve',
      },
    },
    required: ['userId'],
  },
};

export async function handleGetUser(
  fergusClient: FergusClient,
  args: { userId: string }
) {
  const { userId } = args;

  if (!userId) {
    throw new Error('userId is required');
  }

  const user = await fergusClient.get(`/users/${userId}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
}
