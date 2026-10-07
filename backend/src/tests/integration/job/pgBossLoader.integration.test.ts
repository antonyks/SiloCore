import { importPgBoss } from '../../../modules/job/pgBoss.loader.cjs';

// Repeated calls warm the compilation cache; the other file uses a separate Jest environment.
it('loads pg-boss repeatedly in one integration environment', async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { PgBoss } = await importPgBoss();
    expect(typeof PgBoss).toBe('function');
  }
});
