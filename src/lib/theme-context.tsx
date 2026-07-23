import { createContext, useContext, type ReactNode } from 'react';

type EffectiveScheme = 'light' | 'dark';

const ThemeContext = createContext<EffectiveScheme>('light');

export function ThemeProvider({
  value,
  children,
}: {
  value: EffectiveScheme;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useEffectiveScheme(): EffectiveScheme {
  return useContext(ThemeContext);
}
