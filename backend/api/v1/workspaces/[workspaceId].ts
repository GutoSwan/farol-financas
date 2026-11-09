/**
 * Vercel dynamic function for /api/v1/workspaces/:workspaceId.
 * Auth, MFA (AAL2), and membership are enforced inside Fastify.
 */
export { default } from '../../../src/native-handler.js'
