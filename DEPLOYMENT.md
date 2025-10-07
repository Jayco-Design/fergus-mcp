# Deploying Fergus MCP Server to Render

This guide walks you through deploying the Fergus MCP Server to Render with Redis session storage.

## Prerequisites

- A [Render account](https://render.com)
- A GitHub repository with this code
- AWS Cognito OAuth credentials (Client ID, Client Secret, User Pool ID)
- Fergus API access

## Deployment Steps

### 1. Push Code to GitHub

Make sure your code is pushed to a GitHub repository:

```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### 2. Create a New Blueprint on Render

1. Go to https://render.com/dashboard
2. Click **"New" → "Blueprint"**
3. Connect your GitHub repository
4. Render will automatically detect the `render.yaml` file

### 3. Configure Environment Variables

Before deploying, you need to set the secret environment variables in the Render Dashboard. The `render.yaml` file marks these as `sync: false` for security.

Navigate to your **fergus-mcp-server** service settings and add the following environment variables:

#### Required OAuth Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `COGNITO_USER_POOL_ID` | Your AWS Cognito User Pool ID | `us-east-1_abc123` |
| `COGNITO_CLIENT_ID` | OAuth Client ID from Cognito | `1234567890abcdef` |
| `COGNITO_CLIENT_SECRET` | OAuth Client Secret from Cognito | `your-secret-here` |

#### Update Public URLs

After your first deployment, Render will assign you a URL like `https://fergus-mcp-server.onrender.com`. You need to update two environment variables with this URL:

1. In Render Dashboard, go to your service's **Environment** tab
2. Update these variables:
   - `PUBLIC_URL`: `https://your-actual-url.onrender.com`
   - `OAUTH_REDIRECT_URI`: `https://your-actual-url.onrender.com/oauth/callback`

3. Click **"Save Changes"** and your service will automatically redeploy

### 4. Configure AWS Cognito

In your AWS Cognito User Pool, you need to add Render's URLs to the allowed callback URLs:

1. Go to AWS Cognito Console
2. Select your User Pool
3. Navigate to **App integration → App client settings**
4. Add to **Allowed callback URLs**:
   ```
   https://your-actual-url.onrender.com/oauth/callback
   https://claude.ai/api/mcp/auth_callback
   ```
5. Add to **Allowed sign-out URLs**:
   ```
   https://your-actual-url.onrender.com
   ```
6. Save changes

### 5. Deploy!

Click **"Apply"** on the Render Blueprint creation page. Render will:

1. Create a Redis instance (`fergus-mcp-redis`)
2. Create a Node.js web service (`fergus-mcp-server`)
3. Automatically connect them via internal networking
4. Deploy your application

The first deployment takes about 3-5 minutes.

## What Gets Deployed

### Redis Service
- **Name**: `fergus-mcp-redis`
- **Plan**: Free (25 MB)
- **Purpose**: Session and token storage
- **Network**: Internal only (ipAllowList: [])

### Web Service
- **Name**: `fergus-mcp-server`
- **Plan**: Free tier available
- **Runtime**: Node.js
- **Port**: 10000 (Render default)
- **Auto-deploy**: Yes (on git push)

## Verifying Deployment

### 1. Check Health Endpoint

```bash
curl https://your-actual-url.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "activeSessions": 0,
  "timestamp": "2025-01-08T12:00:00.000Z"
}
```

### 2. Check OAuth Discovery

```bash
curl https://your-actual-url.onrender.com/.well-known/oauth-authorization-server
```

Expected response (should include your authorization endpoints):
```json
{
  "issuer": "https://your-actual-url.onrender.com",
  "authorization_endpoint": "https://your-actual-url.onrender.com/oauth/authorize",
  "token_endpoint": "https://your-actual-url.onrender.com/oauth/token",
  ...
}
```

### 3. Check Logs

In Render Dashboard:
1. Go to your `fergus-mcp-server` service
2. Click **"Logs"** tab
3. Look for:
   ```
   [HTTP OAuth Server] Token storage: redis
   [RedisTokenManager] Connected to Redis
   MCP HTTP server (OAuth) listening on http://0.0.0.0:10000
   ```

## Connecting from Claude

### Claude Web

1. Go to Claude.ai
2. Click on your profile → **Settings**
3. Navigate to **Integrations** → **Model Context Protocol**
4. Click **"Add Server"**
5. Enter your Render URL: `https://your-actual-url.onrender.com`
6. Claude will discover OAuth endpoints automatically
7. Click **"Authorize"** and complete the Cognito OAuth flow
8. Start using Fergus tools in Claude!

### Claude Desktop (Remote Mode)

1. Open Claude Desktop
2. Go to **Settings** → **Developers** → **Model Context Protocol**
3. Click **"Add Server"** → **"Remote Server"**
4. Enter your Render URL
5. Complete OAuth authorization
6. Fergus tools will appear in Claude Desktop

## Monitoring

### View Active Sessions

Check the `/health` endpoint:
```bash
curl https://your-actual-url.onrender.com/health
```

### Redis Statistics

From Render Dashboard:
1. Go to your `fergus-mcp-redis` service
2. Check **Metrics** tab for:
   - Memory usage
   - Number of keys
   - Connection count

### Application Logs

Render provides real-time logs:
1. Navigate to `fergus-mcp-server` service
2. Click **"Logs"** tab
3. Filter by log level or search for specific events

## Scaling

### Free Tier Limits

- **Web Service**: Spins down after 15 minutes of inactivity
- **Redis**: 25 MB storage, persistence disabled
- **Bandwidth**: 100 GB/month

### Upgrading

To handle more traffic:

1. **Upgrade Web Service** ($7/month):
   - No spin-down
   - Better performance
   - Health checks

2. **Upgrade Redis** ($7/month):
   - 256 MB storage
   - Persistence enabled
   - Better performance

Update `render.yaml`:
```yaml
services:
  - type: redis
    name: fergus-mcp-redis
    plan: starter  # Change from 'free'

  - type: web
    name: fergus-mcp-server
    plan: starter  # Change from 'free'
```

## Troubleshooting

### Service Won't Start

**Check logs** for:
- Missing environment variables
- Redis connection errors
- Port binding issues

**Solution**: Verify all required env vars are set in Render Dashboard

### OAuth Flow Fails

**Common issues**:
1. `OAUTH_REDIRECT_URI` doesn't match Render URL
2. Cognito callback URLs not configured
3. `PUBLIC_URL` not set correctly

**Solution**:
- Update `PUBLIC_URL` and `OAUTH_REDIRECT_URI` with actual Render URL
- Add Render URL to Cognito allowed callbacks

### Redis Connection Errors

**Check**:
- Both services are in the same region
- Redis service is running
- `REDIS_URL` environment variable is set (automatically by Render)

**Solution**: Restart the web service if Redis was created after

### Session Data Lost

**Cause**: Free tier Redis doesn't persist data on restart

**Solution**: Upgrade to paid Redis plan for persistence

### Slow Cold Starts

**Cause**: Free tier spins down after 15 minutes

**Solution**:
- Upgrade to paid plan
- Or accept 30-60 second cold start delay

## Environment Variables Reference

### Auto-Set by Render (via render.yaml)

| Variable | Source | Description |
|----------|--------|-------------|
| `REDIS_URL` | From Redis service | Internal Redis connection string |
| `HTTP_PORT` | Static (10000) | Render's required port |
| `HTTP_HOST` | Static (0.0.0.0) | Bind to all interfaces |
| `SESSION_STORAGE` | Static (redis) | Use Redis for sessions |
| `NODE_ENV` | Static (production) | Production mode |

### Manually Set in Dashboard

| Variable | Required | Description |
|----------|----------|-------------|
| `COGNITO_USER_POOL_ID` | Yes | AWS Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | Yes | OAuth Client ID |
| `COGNITO_CLIENT_SECRET` | Yes | OAuth Client Secret |
| `PUBLIC_URL` | Yes* | Your Render service URL |
| `OAUTH_REDIRECT_URI` | Yes* | `{PUBLIC_URL}/oauth/callback` |

*Set after first deployment when URL is assigned

## Continuous Deployment

Render automatically deploys on every git push to your default branch:

1. Make changes locally
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update feature"
   git push origin main
   ```
3. Render detects the push and deploys automatically
4. Check **Logs** tab to monitor deployment

### Manual Deploy

In Render Dashboard:
1. Go to your service
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

## Backup and Recovery

### Session Data

Sessions are ephemeral and stored in Redis. On free tier:
- No persistence
- Data lost on Redis restart

On paid tier:
- Daily snapshots
- Point-in-time recovery available

### Application Code

Your code is in GitHub - always recoverable:
```bash
git clone https://github.com/your-org/fergus-mcp.git
```

### Configuration

Export environment variables from Render Dashboard periodically and store securely.

## Cost Estimate

### Free Tier (Recommended for Development)
- **Web Service**: $0
- **Redis**: $0
- **Total**: $0/month

### Production Setup
- **Web Service** (Starter): $7/month
- **Redis** (Starter): $7/month
- **Total**: $14/month

### High-Traffic Setup
- **Web Service** (Standard): $25/month
- **Redis** (Standard): $25/month
- **Total**: $50/month

## Security Notes

1. **Never commit secrets** - All OAuth credentials are in environment variables
2. **HTTPS enforced** - Render provides free SSL certificates
3. **Internal Redis** - Redis is not exposed to the internet
4. **Token encryption** - Consider implementing at-rest encryption for production
5. **CORS configured** - Only Claude.ai domains allowed

## Support

- **Render Issues**: https://render.com/docs
- **Application Issues**: Check service logs in Render Dashboard
- **OAuth Issues**: Verify Cognito configuration
- **GitHub Issues**: https://github.com/your-org/fergus-mcp/issues

## Next Steps

After deployment:
1. Test the health endpoint
2. Verify OAuth flow with Claude Web
3. Monitor logs for any errors
4. Consider upgrading to paid plans for production use
5. Set up monitoring/alerts in Render Dashboard
