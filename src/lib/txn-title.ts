import { categoryLabel, categoryOf, INCOME_LABEL_KEY } from './categories';
import type { Category } from './categories';
import { i18n } from './i18n';
import type { Txn } from './transactions';

/**
 * Display text for a transaction: the user's note (`name`), else the legacy
 * `note` column, else the category label in the current language.
 */
export function txnTitle(
  txn: Pick<Txn, 'name' | 'note' | 'category' | 'isIncome'>,
  extras: Category[] = [],
): string {
  const name = txn.name?.trim() ?? '';
  if (name) return name;
  const note = txn.note?.trim() ?? '';
  if (note) return note;
  return txn.isIncome ? i18n.t(INCOME_LABEL_KEY) : categoryLabel(categoryOf(txn.category, extras));
}
