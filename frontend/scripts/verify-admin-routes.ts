/**
 * CI guard: flag /api/admin routes that call getUser() without isAdmin/requireAdminForApi.
 * Run: npx tsx scripts/verify-admin-routes.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const adminDir = path.join(process.cwd(), 'app', 'api', 'admin');
const issues: string[] = [];

function walk(dir: string) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name === 'route.ts') check(p);
  }
}

function check(file: string) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('getUser(')) return;
  const hasGate =
    src.includes('requireAdminForApi') ||
    src.includes('isAdmin(') ||
    src.includes('isAdminUser') ||
    src.includes('is_admin');
  if (!hasGate) {
    issues.push(path.relative(process.cwd(), file));
  }
}

walk(adminDir);

if (issues.length) {
  console.error('Admin routes missing admin gate:\n' + issues.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('verify-admin-routes: ok');
