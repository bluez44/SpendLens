export type LanguageSetting = 'auto' | 'vi' | 'en';
export type ResolvedLanguage = 'vi' | 'en';

export function resolveLanguage(
  setting: LanguageSetting,
  deviceLocale: string | null,
): ResolvedLanguage {
  if (setting === 'vi' || setting === 'en') return setting;
  if (deviceLocale?.toLowerCase().startsWith('en')) return 'en';
  return 'vi';
}
