// Manual Jest mock for `expo-sqlite`.
//
// expo-sqlite's synchronous database API (`openDatabaseSync`, `execSync`,
// `getAllSync`, ...) is backed by a native `NativeDatabase` class exposed as
// a JSI SharedObject. jest-expo's generic native-module auto-mock (see
// jest-expo/src/preset/moduleMocks/expoModules.js) only stubs out the
// `ExpoSQLite` module's plain functions (backupDatabaseAsync, etc.) — it has
// no way to fabricate a `NativeDatabase` constructor. Without this file,
// `SQLite.openDatabaseSync()` throws:
//   TypeError: _ExpoSQLite.default.NativeDatabase is not a constructor
//
// Jest automatically substitutes this file for `expo-sqlite` in any
// node_modules import (no `jest.mock('expo-sqlite')` call needed) because it
// lives in a `__mocks__` directory adjacent to `node_modules`.
//
// It backs `openDatabaseSync` with Node's built-in `node:sqlite` module
// (stable in this Node runtime), so schema creation and queries in tests run
// against a real SQLite engine rather than a stub that returns empty
// results. Every database is opened in-memory regardless of the requested
// name/path, so running tests never writes stray `.db` files into the repo.
//
// Node ambient types aren't globally enabled in this project (Expo's base
// tsconfig deliberately omits `"types": ["node"]` so on-device app code
// can't accidentally reference Node-only APIs). This file runs under Jest's
// Node process, not on-device, so it opts in locally via a triple-slash
// reference instead of changing that project-wide default.
/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';

class MockSQLiteDatabase {
  private readonly nativeDb: DatabaseSync;

  constructor() {
    this.nativeDb = new DatabaseSync(':memory:');
  }

  execSync(source: string): void {
    this.nativeDb.exec(source);
  }

  getAllSync<T>(source: string, ...params: any[]): T[] {
    return this.nativeDb.prepare(source).all(...params) as T[];
  }

  getFirstSync<T>(source: string, ...params: any[]): T | undefined {
    // Handle both array and spread parameters
    const actualParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return this.nativeDb.prepare(source).get(...actualParams) as T | undefined;
  }

  runSync(source: string, ...params: any[]): { lastInsertRowId: number } {
    const stmt = this.nativeDb.prepare(source);
    stmt.run(...params);
    // Get the last insert row ID
    const result = this.nativeDb.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return { lastInsertRowId: result.id };
  }
}

export function openDatabaseSync(_name: string): MockSQLiteDatabase {
  return new MockSQLiteDatabase();
}
