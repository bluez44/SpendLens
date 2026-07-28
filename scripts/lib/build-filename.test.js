const { buildApkFilename } = require('./build-filename');

describe('buildApkFilename', () => {
  const fixedDate = new Date(2026, 6, 28, 14, 30); // 2026-07-28 14:30 local

  test('builds release filename with semver version', () => {
    expect(buildApkFilename({ version: '1.2.3', variant: 'release', date: fixedDate }))
      .toBe('SpendLens-v1.2.3-release-2026-07-28-1430.apk');
  });

  test('builds debug filename', () => {
    expect(buildApkFilename({ version: '1.0.0', variant: 'debug', date: fixedDate }))
      .toBe('SpendLens-v1.0.0-debug-2026-07-28-1430.apk');
  });

  test('pads single-digit month/day/hour/minute', () => {
    const d = new Date(2026, 0, 5, 9, 7); // Jan 5, 09:07
    expect(buildApkFilename({ version: '1.0.0', variant: 'release', date: d }))
      .toBe('SpendLens-v1.0.0-release-2026-01-05-0907.apk');
  });

  test('falls back to "unknown" when version missing', () => {
    expect(buildApkFilename({ version: null, variant: 'release', date: fixedDate }))
      .toBe('SpendLens-vunknown-release-2026-07-28-1430.apk');
    expect(buildApkFilename({ version: undefined, variant: 'release', date: fixedDate }))
      .toBe('SpendLens-vunknown-release-2026-07-28-1430.apk');
    expect(buildApkFilename({ version: '', variant: 'release', date: fixedDate }))
      .toBe('SpendLens-vunknown-release-2026-07-28-1430.apk');
  });
});
