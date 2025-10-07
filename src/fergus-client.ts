/**
 * Fergus API Client
 * Handles authentication and API requests to the Fergus platform
 */

export interface FergusClientConfig {
  apiToken: string;
  baseUrl?: string;
}

export class FergusAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'FergusAPIError';
  }
}

export class FergusClient {
  private apiToken: string;
  private baseUrl: string;

  constructor(config: FergusClientConfig) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl || 'https://api.fergus.com';
  }

  /**
   * Makes an authenticated request to the Fergus API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.apiToken}`);
    headers.set('Content-Type', 'application/json');

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle authentication errors
      if (response.status === 401) {
        throw new FergusAPIError(
          'Authentication failed. Please check your Personal Access Token.',
          401
        );
      }

      if (response.status === 403) {
        throw new FergusAPIError(
          'Access forbidden. You do not have permission to access this resource.',
          403
        );
      }

      // Handle other error responses
      if (!response.ok) {
        const errorBody = await response.text();
        throw new FergusAPIError(
          `API request failed: ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error) {
      if (error instanceof FergusAPIError) {
        throw error;
      }
      throw new FergusAPIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * GET request to Fergus API
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * POST request to Fergus API
   */
  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request to Fergus API
   */
  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request to Fergus API
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * Health check to verify API connectivity and authentication
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Attempt to fetch jobs as a health check
      await this.get('/jobs?limit=1');
      return true;
    } catch (error) {
      return false;
    }
  }
}
