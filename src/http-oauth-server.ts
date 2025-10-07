/**
 * HTTP OAuth Server Entry Point
 * Starts the MCP HTTP server with OAuth 2.0 authentication
 */

import { loadHttpOAuthConfig } from './config.js';
import { startHttpOAuthServer } from './transports/http.js';

async function main() {
  try {
    // Load configuration with OAuth support
    console.error('Loading OAuth configuration...');
    const config = loadHttpOAuthConfig();

    console.error(`Starting MCP HTTP server with OAuth on ${config.httpHost}:${config.httpPort}...`);
    console.error(`OAuth Provider: AWS Cognito (${config.oauth.domain})`);
    console.error(`Session Storage: ${config.session.storage}`);

    // Start HTTP server with OAuth
    await startHttpOAuthServer(config);

    console.error('MCP HTTP OAuth server started successfully');
    console.error('');
    console.error('To authorize, navigate to:');
    console.error(`  http://${config.httpHost}:${config.httpPort}/oauth/authorize`);
    console.error('');
    console.error('Server is ready to accept MCP requests from Claude Web');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error starting server: ${error.message}`);
      if (error.message.includes('OAuth configuration')) {
        console.error('');
        console.error('Required environment variables:');
        console.error('  - COGNITO_USER_POOL_ID');
        console.error('  - COGNITO_CLIENT_ID');
        console.error('  - COGNITO_CLIENT_SECRET');
        console.error('  - COGNITO_REGION');
        console.error('  - COGNITO_DOMAIN');
        console.error('  - OAUTH_REDIRECT_URI');
        console.error('');
        console.error('See .env.example for more details');
      }
    } else {
      console.error('Unknown error starting server');
    }
    process.exit(1);
  }
}

main();
