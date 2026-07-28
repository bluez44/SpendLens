import { mergeSnapshots, computeSourceMap } from './merge';
import type { Snapshot, SnapshotTxn } from './types';

function txn(uuid: string, updatedAt: number, name = uuid): SnapshotTxn {
  return {
    uuid, date: '2026-07-01', time: '10:00',
    createdAt: updatedAt, updatedAt, category: 'food',
    name, note: null, amount: 1, isIncome: 0, photoUuid: null,
  };
}

function snap(deviceId: string, ts: number, txns: SnapshotTxn[] = []): Snapshot {
  return {
    version: 1, generatedAt: ts, deviceId,
    transactions: txns, categories: [],
    settings: { updatedAt: ts, values: {} }, photoManifest: [],
  };
}

describe('mergeSnapshots', () => {
  it('local strategy returns local verbatim', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'local');
    expect(m.transactions.map(t => t.uuid)).toEqual(['a']);
  });

  it('cloud strategy returns remote verbatim', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'cloud');
    expect(m.transactions.map(t => t.uuid)).toEqual(['b']);
  });

  it('combine keeps disjoint uuids from both sides', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(new Set(m.transactions.map(t => t.uuid))).toEqual(new Set(['a', 'b']));
  });

  it('combine: local wins when local updatedAt is newer', () => {
    const l = snap('L', 100, [txn('x', 300, 'local-name')]);
    const r = snap('R', 200, [txn('x', 200, 'remote-name')]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.transactions[0].name).toBe('local-name');
  });

  it('combine: remote wins when remote updatedAt is newer', () => {
    const l = snap('L', 100, [txn('x', 200, 'local-name')]);
    const r = snap('R', 200, [txn('x', 300, 'remote-name')]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.transactions[0].name).toBe('remote-name');
  });

  it('combine: on updatedAt tie, deviceId alphabetical wins', () => {
    const l = snap('B', 100, [txn('x', 500, 'from-B')]);
    const r = snap('A', 200, [txn('x', 500, 'from-A')]);
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.transactions[0].name).toBe('from-A');
  });

  it('combine: settings uses whole-block last-write-wins', () => {
    const l: Snapshot = { ...snap('L', 100), settings: { updatedAt: 100, values: { a: '1' } } };
    const r: Snapshot = { ...snap('R', 200), settings: { updatedAt: 200, values: { b: '2' } } };
    const m = mergeSnapshots(l, r, 'combine');
    expect(m.settings.values).toEqual({ b: '2' });
  });
});

describe('computeSourceMap', () => {
  it('marks local-only as local, remote-only as cloud, both-present as merged', () => {
    const l = snap('L', 100, [txn('a', 100), txn('c', 500)]);
    const r = snap('R', 200, [txn('b', 200), txn('c', 300)]);
    const m = mergeSnapshots(l, r, 'combine');
    const map = computeSourceMap(l, r, m, 'combine');
    expect(map).toEqual({ a: 'local', b: 'cloud', c: 'merged' });
  });

  it('local strategy marks all as local', () => {
    const l = snap('L', 100, [txn('a', 100)]);
    const r = snap('R', 200, [txn('b', 200)]);
    const m = mergeSnapshots(l, r, 'local');
    expect(computeSourceMap(l, r, m, 'local')).toEqual({ a: 'local' });
  });
});
