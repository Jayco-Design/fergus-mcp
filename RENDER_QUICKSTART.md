# Render Deployment - Quick Start

## What Was Added

This MCP server now supports deployment to Render with Redis session storage:

### New Files
- `render.yaml` - Infrastructure as Code configuration for Render
- `DEPLOYMENT.md` - Complete deployment guide
- `src/auth/redis-token-manager.ts` - Redis-backed token storage
- `src/auth/token-manager-interface.ts` - Shared interface for token managers

### Modified Files
- `package.json` - Added `ioredis` dependency, updated start scripts
- `src/transports/http.ts` - Auto-selects Redis or in-memory based on config
- `README.md` - Added deployment section linking to guide

## Architecture

```
┌─────────────────┐
│  Claude Web     │
│  Claude Desktop │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐     Internal
│  Render Web     │────────────┐
│  Service        │            │
│  (Node.js)      │            ↓
│                 │     ┌──────────────┐
│  Port: 10000    │     │ Render Redis │
│  OAuth + MCP    │     │ (Sessions)   │
└─────────────────┘     └──────────────┘
```

## Redis Integration

The server automatically switches between in-memory and Redis storage based on environment variables:

- **Local development**: In-memory token storage (fast, simple)
- **Production (Render)**: Redis token storage (persistent, scalable)

### How It Works

1. On startup, checks `SESSION_STORAGE` environment variable
2. If `redis` + `REDIS_URL` present: Uses `RedisTokenManager`
3. Otherwise: Uses in-memory `TokenManager`
4. Both implement the same interface, so code is identical

## Environment Variables on Render

### Auto-configured (via render.yaml)
- `SESSION_STORAGE=redis`
- `REDIS_URL` (from Redis service connection)
- `HTTP_PORT=10000`
- `HTTP_HOST=0.0.0.0`
- `NODE_ENV=production`

### Manually configured (via Dashboard)
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_CLIENT_SECRET`
- `PUBLIC_URL` (set after first deploy)
- `OAUTH_REDIRECT_URI` (set after first deploy)

## Deployment Steps Summary

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Create Blueprint on Render**
   - Connect GitHub repo
   - Render detects `render.yaml`

3. **Set Secret Environment Variables**
   - Add Cognito credentials in Dashboard

4. **Deploy & Get URL**
   - First deployment provisions everything
   - Note your Render URL

5. **Update URLs**
   - Set `PUBLIC_URL` and `OAUTH_REDIRECT_URI` in Render
   - Add URL to Cognito allowed callbacks

6. **Test**
   - Check `/health` endpoint
   - Connect from Claude Web

## What Render Provisions

When you deploy:

1. **Redis Instance**
   - Free tier: 25 MB
   - Internal-only networking
   - Auto-connected via `REDIS_URL`

2. **Web Service**
   - Node.js runtime
   - Auto-builds with `pnpm`
   - Free SSL certificate
   - Auto-deploy on git push

## Key Features

✅ **Zero-downtime deploys**: Render handles rolling updates
✅ **Automatic SSL**: HTTPS enabled by default
✅ **Internal Redis**: Not exposed to internet
✅ **Graceful shutdown**: Redis connection closes cleanly
✅ **Session persistence**: Tokens survive server restarts (on paid tier)
✅ **Auto-scaling**: Upgrade plan for multiple instances

## Cost

- **Free Tier**: $0/month (good for testing)
  - Web service spins down after 15 min inactivity
  - Redis has no persistence

- **Production**: $14/month
  - Always-on web service
  - Persistent Redis with backups

## Testing Locally with Redis

To test Redis locally before deploying:

1. **Start Redis**:
   ```bash
   docker run -p 6379:6379 redis:latest
   ```

2. **Configure environment**:
   ```bash
   export SESSION_STORAGE=redis
   export REDIS_URL=redis://localhost:6379
   # ... other OAuth vars
   ```

3. **Run server**:
   ```bash
   pnpm run dev:oauth
   ```

4. **Verify**:
   - Look for: `[HTTP OAuth Server] Token storage: redis`
   - Look for: `[RedisTokenManager] Connected to Redis`

## Monitoring on Render

### Application Logs
- Real-time logs available in Dashboard
- Search and filter by log level
- Download for analysis

### Health Check
```bash
curl https://your-app.onrender.com/health
```

Response shows:
- Service status
- Active session count
- Current timestamp

### Redis Metrics
- Memory usage
- Key count
- Connection count

## Troubleshooting

### "Cannot connect to Redis"
- Check both services in same region
- Verify `REDIS_URL` is set
- Restart web service

### "OAuth flow fails"
- Verify `PUBLIC_URL` matches actual URL
- Check Cognito callback URLs
- Look for CORS errors in browser console

### "Session data lost"
- Free tier Redis doesn't persist
- Upgrade to paid plan for persistence
- Or accept session loss on restart

## Next Steps

1. **Review DEPLOYMENT.md** for complete guide
2. **Set up Cognito** with your OAuth app
3. **Deploy to Render** following guide
4. **Test with Claude Web**
5. **Monitor logs** for any issues
6. **Consider upgrading** for production use

## Support

- Full guide: `DEPLOYMENT.md`
- Render docs: https://render.com/docs
- GitHub issues: [Your repo issues page]
