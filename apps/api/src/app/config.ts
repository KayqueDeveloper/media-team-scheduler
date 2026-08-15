import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    CORS_ORIGIN: z.string().optional(),
    APP_TIME_ZONE: z.string().trim().min(1).default('America/Sao_Paulo'),
    PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
    DATABASE_URL: z.string().trim().min(1).optional(),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1).optional(),
    SUPABASE_SECRET_KEY: z.string().trim().min(1).optional(),
    CONFIRMATION_TOKEN_SECRET: z.string().min(32).optional()
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.CONFIRMATION_TOKEN_SECRET === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['CONFIRMATION_TOKEN_SECRET'],
        message: 'CONFIRMATION_TOKEN_SECRET é obrigatório em produção.'
      });
    }
  });

export interface ApiConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly timeZone: string;
  readonly publicAppUrl: string;
  readonly databaseUrl: string | null;
  readonly confirmationTokenSecret: string | null;
  readonly supabase: {
    readonly url: string | null;
    readonly publishableKey: string | null;
    readonly secretKey: string | null;
  };
}

export function loadConfig(environment: Readonly<Record<string, string | undefined>>): ApiConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida: ${details}`);
  }

  return {
    environment: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    corsOrigins: (parsed.data.CORS_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    timeZone: parsed.data.APP_TIME_ZONE,
    publicAppUrl: parsed.data.PUBLIC_APP_URL,
    databaseUrl: parsed.data.DATABASE_URL ?? null,
    confirmationTokenSecret: parsed.data.CONFIRMATION_TOKEN_SECRET ?? null,
    supabase: {
      url: parsed.data.SUPABASE_URL ?? null,
      publishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY ?? null,
      secretKey: parsed.data.SUPABASE_SECRET_KEY ?? null
    }
  };
}
