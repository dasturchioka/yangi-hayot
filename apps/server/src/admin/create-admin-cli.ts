/**
 * Creates the first admin-panel user (later ones are added in the panel).
 *   pnpm --filter @yh/server admin:create <login> <administrator|menejer> [nomi]
 * Password: env ADMIN_PASSWORD, or typed in when asked.
 */
import { createInterface } from 'node:readline/promises';
import { ADMIN_ROLLAR, type AdminRol } from '@yh/shared';
import pg from 'pg';
import { migrate } from '../db/migrate';
import { createAdminUser, MIN_PASSWORD_LENGTH } from './accounts';

const [login, rol, nomi] = process.argv.slice(2);
if (!login || !ADMIN_ROLLAR.includes(rol as AdminRol)) {
  console.error('Usage: admin:create <login> <administrator|menejer> [nomi]');
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Parol: ');
  rl.close();
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`);
  process.exit(1);
}

const db = new pg.Pool({ connectionString: databaseUrl });
try {
  await migrate(db);
  const user = await createAdminUser(db, { login, password, rol: rol as AdminRol, nomi: nomi ?? login }, new Date());
  console.log(`Yaratildi: ${user.login} (${user.rol})`);
} finally {
  await db.end();
}
