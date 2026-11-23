import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { migrate } from '../../src/db/migrate';

export const TEMPLATE_DB = 'yh_template';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Admin connection string to the test PostgreSQL server (database "postgres"). */
    pgAdminUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const adminUrl = withDatabase(container.getConnectionUri(), 'postgres');

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  const template = new pg.Pool({ connectionString: withDatabase(adminUrl, TEMPLATE_DB) });
  await migrate(template);
  await template.end();

  project.provide('pgAdminUrl', adminUrl);
}

export async function teardown() {
  await container?.stop();
}

export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}
