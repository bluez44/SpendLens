export function decideBudgetAlert(input: {
  spent: number;
  budget: number;
  notifiedMonth: string;   // 'YYYY-MM:80' | 'YYYY-MM:100' | ''
  currentMonth: string;    // 'YYYY-MM'
}): 80 | 100 | null {
  const { spent, budget, notifiedMonth, currentMonth } = input;
  if (budget <= 0) return null;
  const pct = (spent / budget) * 100;
  const [lastMonth, lastLevel] = notifiedMonth.split(':');
  const lastLevelNum = Number(lastLevel) || 0;
  const sameMonth = lastMonth === currentMonth;
  if (pct >= 100 && !(sameMonth && lastLevelNum >= 100)) return 100;
  if (pct >= 80 && !(sameMonth && lastLevelNum >= 80)) return 80;
  return null;
}
