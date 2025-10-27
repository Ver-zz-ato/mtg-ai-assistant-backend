export function encodeBase64Url(json: string): string {
  try {
    if (typeof window !== 'undefined') return btoa(json).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return Buffer.from(json).toString('base64url');
  } catch { return ''; }
}
export function decodeBase64Url(b64url: string): string {
  try {
    const s = (b64url||'').replace(/-/g,'+').replace(/_/g,'/');
    if (typeof window !== 'undefined') return atob(s);
    return Buffer.from(s, 'base64').toString('utf8');
  } catch { return ''; }
}
