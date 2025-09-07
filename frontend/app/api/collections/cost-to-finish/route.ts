// Alias /api/collections/cost-to-finish -> /api/collections/cost
export const runtime = "nodejs";

// Reuse the existing handler
export { POST } from "../cost/route";
