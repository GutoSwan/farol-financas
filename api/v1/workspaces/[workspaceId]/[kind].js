/**
 * Vercel's Vite function router does not expand [...path] across nested segments.
 * Register the exact two-segment financial read route explicitly.
 * Authorization, AAL2, allowed modules, and OIDC remain enforced by the
 * shared Preview proxy and the backend.
 */
import proxyHandler from '../../[...path].js'

export default proxyHandler
