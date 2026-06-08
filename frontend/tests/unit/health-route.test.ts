import assert from "node:assert/strict";
import { GET } from "@/app/api/health/route";

async function main() {
  const res = await GET(new Request("https://www.manatap.ai/api/health") as any);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.match(String(json.status), /alive|degraded/);
  assert.equal(typeof json.dependencyOk, "boolean");
  console.log("health-route: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
