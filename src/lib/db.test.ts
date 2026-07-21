import { createDb } from './db';

describe('createDb', () => {
  it('creates the expected tables on an in-memory database', () => {
    const database = createDb(':memory:');
    const tables = database.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    expect(tables.map((t) => t.name)).toEqual(['settings', 'transactions', 'users']);
  });
});
