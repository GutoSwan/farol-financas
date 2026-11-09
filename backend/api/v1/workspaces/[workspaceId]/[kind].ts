/**
 * Vercel dynamic function for financial read modules:
 * /api/v1/workspaces/:workspaceId/(transactions|recurring-bills|fixed-expenses|budgets)
 * JWT, AAL2 and workspace membership remain enforced inside Fastify.
 */
export { default } from '../../../../src/native-handler.js'
