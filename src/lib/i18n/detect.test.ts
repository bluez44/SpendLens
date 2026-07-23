import { resolveLanguage } from './detect';

describe('resolveLanguage', () => {
  it('returns explicit setting when not auto', () => {
    expect(resolveLanguage('vi', 'en-US')).toBe('vi');
    expect(resolveLanguage('en', 'vi-VN')).toBe('en');
  });

  it('auto + english device -> en', () => {
    expect(resolveLanguage('auto', 'en-US')).toBe('en');
    expect(resolveLanguage('auto', 'EN')).toBe('en');
  });

  it('auto + vietnamese device -> vi', () => {
    expect(resolveLanguage('auto', 'vi-VN')).toBe('vi');
    expect(resolveLanguage('auto', 'VI')).toBe('vi');
  });

  it('auto + other language -> vi (fallback)', () => {
    expect(resolveLanguage('auto', 'ja-JP')).toBe('vi');
    expect(resolveLanguage('auto', 'fr-FR')).toBe('vi');
  });

  it('auto + null device -> vi (fallback)', () => {
    expect(resolveLanguage('auto', null)).toBe('vi');
  });
});
