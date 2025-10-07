/**
 * HTTP Transport for MCP Server
 * Implements Streamable HTTP transport with session management
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { FergusClient } from '../fergus-client.js';
import { createMcpServer } from '../server.js';

/**
 * Session data stored in memory
 */
interface SessionData {
  transport: StreamableHTTPServerTransport;
  fergusClient: FergusClient;
  createdAt: Date;
  lastAccessedAt: Date;
}

/**
 * In-memory session storage
 */
const sessions = new Map<string, SessionData>();

/**
 * HTTP transport configuration options
 */
export interface HttpTransportConfig {
  port: number;
  host: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  enableDnsRebindingProtection?: boolean;
  apiToken: string;  // Temporary: will be replaced with OAuth in Phase 2
  fergusBaseUrl?: string;
}

/**
 * Create and start HTTP transport server
 */
export async function startHttpServer(config: HttpTransportConfig): Promise<void> {
  const app = express();

  // Configure CORS
  app.use(cors({
    origin: config.allowedOrigins || '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }));

  // Parse JSON bodies
  app.use(express.json());

  /**
   * Health check endpoint
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      activeSessions: sessions.size,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * POST /mcp - Handle MCP requests
   */
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing session
      const session = sessions.get(sessionId)!;
      transport = session.transport;
      session.lastAccessedAt = new Date();
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request - create FergusClient and server first
      const fergusClient = new FergusClient({
        apiToken: config.apiToken,
        baseUrl: config.fergusBaseUrl,
      });

      // Create transport with session initialization callback
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          // Store session data
          sessions.set(newSessionId, {
            transport,
            fergusClient,
            createdAt: new Date(),
            lastAccessedAt: new Date(),
          });

          console.error(`Session initialized: ${newSessionId}`);
        },
        // DNS rebinding protection
        enableDnsRebindingProtection: config.enableDnsRebindingProtection ?? true,
        allowedHosts: config.allowedHosts || ['127.0.0.1', 'localhost', `localhost:${config.port}`, `127.0.0.1:${config.port}`],
        allowedOrigins: config.allowedOrigins || [],
      });

      // Clean up on transport close
      transport.onclose = () => {
        if (transport.sessionId && sessions.has(transport.sessionId)) {
          console.error(`Session closed: ${transport.sessionId}`);
          sessions.delete(transport.sessionId);
        }
      };

      // Create and connect MCP server
      const server = createMcpServer(fergusClient);
      await server.connect(transport);
    } else {
      // Invalid request - no session ID and not an initialize request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or missing initialize request',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  /**
   * GET /mcp - Handle SSE notifications
   */
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessions.get(sessionId)!;
    session.lastAccessedAt = new Date();

    await session.transport.handleRequest(req, res);
  });

  /**
   * DELETE /mcp - Handle session termination
   */
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);

    // Session will be cleaned up by transport.onclose
  });

  /**
   * Session cleanup - remove inactive sessions after 1 hour
   */
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    const now = new Date();
    for (const [sessionId, session] of sessions.entries()) {
      const inactiveMs = now.getTime() - session.lastAccessedAt.getTime();
      if (inactiveMs > SESSION_TIMEOUT_MS) {
        console.error(`Cleaning up inactive session: ${sessionId}`);
        session.transport.close();
        sessions.delete(sessionId);
      }
    }
  }, 15 * 60 * 1000); // Check every 15 minutes

  // Start server
  return new Promise((resolve) => {
    app.listen(config.port, config.host, () => {
      console.error(`MCP HTTP server listening on http://${config.host}:${config.port}`);
      resolve();
    });
  });
}
