import { sanitizeHTML } from '@/lib/sanitize';

/**
 * Sanitize blog HTML before dangerouslySetInnerHTML.
 * All blog render paths should pass generated HTML through this helper.
 */
export function sanitizeBlogHtml(html: string): string {
  return sanitizeHTML(html);
}
