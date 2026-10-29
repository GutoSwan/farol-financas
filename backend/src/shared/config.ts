import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//, 'Use uma URL PostgreSQL válida'),
  SUPABASE_URL: z.string().url().refine((url) => new URL(url).protocol === 'https:', 'Use HTTPS no Supabase'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
})

export type AppConfig = z.infer<typeof configSchema>

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = configSchema.safeParse(env)
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Configuração inválida ou ausente: ${names}. Confira backend/.env.`)
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.CORS_ORIGIN.startsWith('https://')) {
    throw new Error('Configuração inválida ou ausente: CORS_ORIGIN. Em produção, use a URL HTTPS real do frontend.')
  }
  return parsed.data
}
