import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(new URL('../../../../../supabase/migrations/', import.meta.url));

describe('migração PostgreSQL de linha de base', () => {
  it('cria todas as tabelas da aplicação com RLS habilitado', async () => {
    const database = new PGlite();
    const migrationFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql'));

    expect(migrationFiles).toHaveLength(1);
    const migrationFile = migrationFiles[0];
    if (migrationFile === undefined) throw new Error('A migração de linha de base não foi encontrada.');

    await database.exec('create role anon; create role authenticated;');
    await database.exec(readFileSync(`${migrationsDirectory}/${migrationFile}`, 'utf8'));

    const result = await database.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relkind = 'r'
        and relname in (
          'volunteers', 'proficiencies', 'unavailabilities', 'schedules',
          'assignments', 'schedule_versions', 'users', 'service_confirmations',
          'schedule_exchanges', 'schedule_change_events', 'notifications'
        )
      order by relname
    `);

    expect(result.rows).toHaveLength(11);
    expect(result.rows.every((table) => table.relrowsecurity)).toBe(true);

    await database.close();
  });
});
