import { generateRobotsTxt } from '@valentinbrclz/web-standards/aio';
import type { APIRoute } from 'astro';

// Production robots.txt. Previews are kept out of search engines by X-Robots-Tag, not here.
export const GET: APIRoute = ({ site }) =>
  new Response(generateRobotsTxt({ productionUrl: String(site) }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
