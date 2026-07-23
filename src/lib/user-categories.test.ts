import { createDb } from './db';
import {
  deleteUserCategory,
  insertUserCategory,
  listUserCategories,
  resetUserCategories,
} from './user-categories';

function freshDb() {
  return createDb(`:memory:-${Math.random()}`);
}

describe('user-categories', () => {
  it('list is empty on fresh db', () => {
    expect(listUserCategories(freshDb())).toEqual([]);
  });

  it('insert then list returns one row with generated id', () => {
    const d = freshDb();
    const uc = insertUserCategory('Gym', d);
    expect(uc.label).toBe('Gym');
    expect(uc.id).toMatch(/^custom_/);
    expect(listUserCategories(d)).toEqual([uc]);
  });

  it('rejects empty or whitespace-only label', () => {
    const d = freshDb();
    expect(() => insertUserCategory('   ', d)).toThrow();
    expect(() => insertUserCategory('', d)).toThrow();
  });

  it('trims whitespace around label', () => {
    const d = freshDb();
    const uc = insertUserCategory('  Coffee  ', d);
    expect(uc.label).toBe('Coffee');
  });

  it('unique constraint: inserting duplicate label throws', () => {
    const d = freshDb();
    insertUserCategory('Gym', d);
    expect(() => insertUserCategory('Gym', d)).toThrow();
  });

  it('delete removes by id', () => {
    const d = freshDb();
    const uc = insertUserCategory('Gym', d);
    deleteUserCategory(uc.id, d);
    expect(listUserCategories(d)).toEqual([]);
  });

  it('resetUserCategories wipes the table', () => {
    const d = freshDb();
    insertUserCategory('A', d);
    insertUserCategory('B', d);
    resetUserCategories(d);
    expect(listUserCategories(d)).toEqual([]);
  });
});
