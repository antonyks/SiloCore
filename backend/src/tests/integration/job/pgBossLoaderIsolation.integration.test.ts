import { importPgBoss } from '../../../modules/job/pgBoss.loader.cjs';

// Keep this in a different file to exercise loading across Jest environment teardown.
it('loads pg-boss repeatedly in an independent integration environment', async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { PgBoss } = await importPgBoss();
    expect(typeof PgBoss).toBe('function');
  }
});
