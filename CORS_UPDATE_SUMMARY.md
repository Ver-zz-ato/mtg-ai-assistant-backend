# CORS Configuration Updated for Production Domains

## Changes Made

### Flask Backend (`backend/app.py`)
✅ **Updated CORS Origins:**
- Added `https://app.manatap.ai` to allowed origins
- Default origins now: `https://manatap.ai`, `https://app.manatap.ai`, `http://localhost:3000`

✅ **Enhanced CORS Configuration:**
- **Methods**: `GET, POST, PUT, DELETE, OPTIONS`
- **Credentials**: `true` (allows cookies/auth headers)
- **Headers**: `Content-Type, Authorization`

✅ **Explicit Preflight Handling:**
- Added dedicated `OPTIONS` route handler for `/api/<path:path>`
- Returns 200 status for all preflight requests
- Ensures proper CORS headers on all responses

### Node.js Backend (`backend/index.js`)
✅ **Updated CORS Configuration:**
- **Origins**: `['https://manatap.ai', 'https://app.manatap.ai', 'http://localhost:3000']`
- **Methods**: `['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']`
- **Credentials**: `true`
- **Options Success Status**: `200` (for legacy browser compatibility)

## Environment Variable Support

The Flask backend supports dynamic CORS origins via environment variable:
```bash
CORS_ORIGINS="https://manatap.ai,https://app.manatap.ai,http://localhost:3000"
```

## Security Notes

✅ **Secure Origins Only**: No wildcards (`*`) used - only specific domains allowed
✅ **Production Ready**: Both `manatap.ai` and `app.manatap.ai` domains supported
✅ **Development Friendly**: `localhost:3000` included for local development
✅ **Credentials Enabled**: Supports authentication cookies and headers

## Testing

To verify CORS is working correctly:

1. **Preflight Test**:
```bash
curl -X OPTIONS \
  -H "Origin: https://app.manatap.ai" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://your-backend-url/api/test
```

2. **Actual Request Test**:
```bash
curl -X POST \
  -H "Origin: https://app.manatap.ai" \
  -H "Content-Type: application/json" \
  https://your-backend-url/api/test
```

Expected headers in response:
- `Access-Control-Allow-Origin: https://app.manatap.ai`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Credentials: true`

## Deployment Notes

After deploying these changes to Render:
1. Frontend requests from `https://manatap.ai` and `https://app.manatap.ai` will be allowed
2. Preflight OPTIONS requests will return 200 status
3. Authentication cookies/headers will be properly handled
4. No browser CORS errors should occur for cross-origin API calls