# Fergus MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that integrates with the Fergus API, enabling AI assistants like Claude to interact with Fergus's job management platform.

## Features

- 🔐 Secure authentication using Personal Access Tokens
- 📋 Access to jobs, customers, quotes, sites, and more
- 🛠️ Tools for creating and managing Fergus resources
- 🔄 Real-time data synchronization with Fergus API

## Installation

### Using with Claude Desktop

The easiest way to use this MCP server with Claude Desktop is via npx:

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

### Using with Other MCP Clients

For other MCP clients that support the stdio transport:

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
   ```bash
   pnpm run dev -- --api-token YOUR_API_TOKEN
   ```

## Configuration

### Authentication

You need a Personal Access Token (PAT) from Fergus to use this server. Get yours from your Fergus account settings.

#### Option 1: Command-line argument (Recommended)

```bash
npx fergus-mcp --api-token YOUR_API_TOKEN
```

#### Option 2: Environment variable

Create a `.env` file:

```env
FERGUS_API_TOKEN=your_fergus_api_token_here
```

### Optional Configuration

- `--base-url`: Override the default Fergus API base URL
- `FERGUS_BASE_URL`: Environment variable for base URL

## Available Tools

### Jobs
- `get-job`: Get details for a specific job by ID
- `list-jobs`: List all jobs with optional filtering

### Resources

- `fergus://jobs`: List of all jobs in Fergus
- `fergus://customers`: List of all customers in Fergus

*More tools and resources coming soon!*

## Usage Examples

Once connected to Claude Desktop, you can ask:

- "Show me all active jobs in Fergus"
- "Get details for job #12345"
- "List all customers"
- "Create a new job for customer ABC Corp"

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

```bash
pnpm run dev -- --api-token YOUR_API_TOKEN
```

## Security

- Never commit your Personal Access Token to version control
- Use environment variables or CLI arguments for configuration
- The server runs locally and communicates directly with the Fergus API
- No data is stored or transmitted to third parties

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-org/fergus-mcp/issues)
- Fergus API Documentation: [https://api.fergus.com/docs](https://api.fergus.com/docs)
