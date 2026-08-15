import type { Express } from 'express';

export interface LegacyApplicationOptions {
  readonly dbPath?: string;
  readonly now?: () => Date;
  readonly timeZone?: string;
  readonly bootstrapAdmin?: Readonly<Record<string, unknown>>;
  readonly supabaseAuthClient?: unknown;
  readonly supabaseAdminClient?: unknown;
  readonly emailSender?: unknown;
  readonly publicAppUrl?: string;
  readonly confirmationTokenSecret?: string;
}

export function createApp(options?: LegacyApplicationOptions): Express;
