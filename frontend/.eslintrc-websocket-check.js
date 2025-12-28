/**
 * ESLint rule to prevent ws:// in client-side code
 * 
 * This is a custom rule suggestion - actual implementation would require
 * a custom ESLint plugin. For now, this file serves as documentation.
 * 
 * To implement:
 * 1. Install eslint-plugin-no-insecure-websocket
 * 2. Add to .eslintrc.json:
 *    {
 *      "plugins": ["no-insecure-websocket"],
 *      "rules": {
 *        "no-insecure-websocket/no-ws-protocol": "error"
 *      }
 *    }
 * 
 * Or use a simple grep check in CI:
 * grep -r "ws://" frontend/ --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
 */

// This is a placeholder file - actual linting should be done via:
// 1. CI grep check (see .github/workflows/ci.yml)
// 2. Or a custom ESLint rule
