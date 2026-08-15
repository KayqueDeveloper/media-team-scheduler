import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('configuração da interface Node', () => {
  it('normaliza origens e mantém segredos fora da configuração pública', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      PORT: '4100',
      CORS_ORIGIN: 'https://painel.test, https://admin.test',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
    });

    expect(config).toMatchObject({
      environment: 'development',
      port: 4100,
      corsOrigins: ['https://painel.test', 'https://admin.test'],
      supabase: {
        url: 'https://project.supabase.co',
        publishableKey: 'sb_publishable_test'
      }
    });
    expect(config).not.toHaveProperty('public');
  });

  it('recusa produção sem segredo para os links de confirmação', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        PORT: '3001'
      })
    ).toThrow(/CONFIRMATION_TOKEN_SECRET/);
  });
});
