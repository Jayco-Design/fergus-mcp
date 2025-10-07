# Fergus MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that integrates with the Fergus API, enabling AI assistants like Claude to interact with Fergus's job management platform.

## Features

- 🔐 Secure authentication (PAT for local, OAuth 2.0 for remote)
- 🌐 Dual transport support: **stdio** (local CLI) and **HTTP** (remote web)
- 📋 26+ tools for jobs, customers, quotes, sites, time entries, and users
- 🛠️ Create, read, and update Fergus resources
- 🔄 Real-time data synchronization with Fergus API
- 💬 Built-in prompts for common workflows

## Installation

This server supports two transport modes:
- **Stdio Transport**: For local use with Claude Desktop (local mode)
- **HTTP Transport**: For remote use with Claude Web or Claude Desktop (remote mode)

### Option 1: Local Mode (Stdio) - Claude Desktop

The easiest way to use this MCP server locally with Claude Desktop:

```bash
claude mcp add fergus-mcp -- npx -y fergus-mcp --api-token YOUR_API_TOKEN
```

Or add it manually to your Claude Desktop config:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "fergus": {
      "command": "npx",
      "args": ["-y", "fergus-mcp", "--api-token", "YOUR_API_TOKEN"]
    }
  }
}
```

### Option 2: Remote Mode (HTTP) - Claude Web/Desktop

For remote access (requires hosting the HTTP server):

1. **Host the HTTP server** (see [Deployment](#deployment) section)
2. **Add as remote server** in Claude:
   - Claude will discover OAuth endpoints automatically
   - Authenticate with your Fergus account via OAuth
   - No manual token configuration needed!

### Local Development

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the project:
   ```bash
   pnpm run build
   ```
4. Run in development mode:

   **Stdio mode** (for testing with local MCP clients):
   ```bash
   pnpm run dev -- --api-token YOUR_API_TOKEN
   ```

   **HTTP mode** (for testing remote server):
   ```bash
   # Create .env file with OAuth credentials
   cp .env.example .env
   # Edit .env with your configuration
   pnpm run dev:http
   ```

## Configuration

### Stdio Mode (Local)

**Personal Access Token (PAT)** is required. Get yours from your Fergus account settings.

#### Option 1: Command-line argument (Recommended)

```bash
npx fergus-mcp --api-token YOUR_API_TOKEN
```

#### Option 2: Environment variable

Create a `.env` file:

```env
FERGUS_API_TOKEN=your_fergus_api_token_here
```

### HTTP Mode (Remote)

**OAuth 2.0 credentials** are required. Configure in `.env`:

```env
# Required OAuth Configuration
COGNITO_USER_POOL_ID=us-east-1-xxxxx
COGNITO_CLIENT_ID=your_client_id
COGNITO_CLIENT_SECRET=your_client_secret
COGNITO_REGION=us-east-1
COGNITO_DOMAIN=auth.fergus.com
OAUTH_REDIRECT_URI=https://your-domain.com/oauth/callback

# Server Configuration
HTTP_PORT=3100
PUBLIC_URL=https://your-domain.com
```

See `.env.example` for complete configuration options.

### Optional Configuration

- `--base-url`: Override the default Fergus API base URL
- `FERGUS_BASE_URL`: Environment variable for base URL

## Available Tools

This server provides 26+ tools organized by resource type:

### Jobs (5 tools)
- `get-job`: Get details for a specific job by ID
- `list-jobs`: List all jobs with filtering and sorting
- `create-job`: Create a new job (draft or finalized)
- `update-job`: Update existing draft job
- `finalize-job`: Convert draft job to active status

### Quotes (7 tools)
- `get-quote`: Get basic quote information
- `get-quote-detail`: Get comprehensive quote with sections and line items
- `list-quotes`: List quotes with filtering
- `create-quote`: Create quote with sections and line items
- `update-quote`: Update draft quote sections (by quote ID)
- `update-quote-version`: Update draft quote sections (by version number)

### Customers (3 tools)
- `get-customer`: Get customer details
- `list-customers`: List customers with search
- `create-customer`: Add new customer
- `update-customer`: Modify customer details

### Sites (3 tools)
- `get-site`: Get site details
- `list-sites`: List sites with filtering
- `create-site`: Add new site
- `update-site`: Modify site details

### Users (3 tools)
- `get-user`: Get user/team member details
- `list-users`: List users with filtering
- `update-user`: Update user details

### Time Entries (2 tools)
- `get-time-entry`: Get time entry details
- `list-time-entries`: List time entries with filtering

### Built-in Prompts (3)
- `job-creation-assistant`: Guided workflow for creating jobs
- `quote-generator`: Help creating comprehensive quotes
- `weekly-report`: Generate job status summaries

## Usage Examples

Once connected, you can ask Claude:

- "Show me all active jobs in Fergus"
- "Create a quote for job #12345"
- "List all customers in Auckland"
- "Update the address for site #456"
- "Show me this week's time entries"
- "Create a new job for ABC Corp at their main office"

## Development

### Project Structure

```
fergus-mcp/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── config.ts             # Configuration management
│   ├── fergus-client.ts      # Fergus API client wrapper
│   ├── resources/            # MCP resource handlers
│   └── tools/                # MCP tool handlers
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
pnpm run build
```

### Running in Dev Mode

**Stdio mode:**
```bash
pnpm run dev -- --api-token YOUR_API_TOKEN
```

**HTTP mode:**
```bash
pnpm run dev:http
```

### Scripts

- `pnpm run build` - Build the project
- `pnpm run dev` - Run stdio server in development mode
- `pnpm run dev:http` - Run HTTP server in development mode
- `pnpm start` - Run built stdio server
- `pnpm start:http` - Run built HTTP server

## Deployment

### Quick Deploy to Render (Recommended)

This server is ready to deploy to [Render](https://render.com) with Redis session storage:

1. **Fork or clone** this repository to your GitHub account
2. **Create a new Blueprint** on Render and connect your repository
3. **Configure OAuth credentials** in Render Dashboard (see [DEPLOYMENT.md](./DEPLOYMENT.md))
4. **Deploy!** Render will automatically provision:
   - Node.js web service
   - Redis instance for sessions
   - SSL certificate
   - Internal networking

See [**DEPLOYMENT.md**](./DEPLOYMENT.md) for complete step-by-step instructions.

### Other Hosting Providers

The server can also be deployed to:
- **Cloudflare Workers**: Use Durable Objects for session storage
- **Vercel**: Configure Redis via Vercel KV
- **Railway**: Similar to Render, uses `render.yaml`
- **AWS/GCP/Azure**: Deploy as containerized app with managed Redis

See `.env.example` for required environment variables.

## Security

### Stdio Mode (Local)
- Never commit your Personal Access Token to version control
- Use environment variables or CLI arguments for configuration
- Server runs locally and communicates directly with Fergus API

### HTTP Mode (Remote)
- OAuth 2.0 with PKCE for secure authentication
- Tokens stored in-memory (optionally Redis for multi-instance deployments)
- HTTPS required in production
- CORS and DNS rebinding protection enabled
- Session-based token management with automatic refresh
- No data stored or transmitted to third parties

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-org/fergus-mcp/issues)
- Fergus API Documentation: [https://api.fergus.com/docs](https://api.fergus.com/docs)
