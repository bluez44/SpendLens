import Share from 'react-native-share';

import type { Category } from './categories';
import { categoryLabel } from './categories';
import { dayLabel, signedVND } from './format';
import type { Txn } from './transactions';

export interface ShareToggles {
  showDate: boolean;
  showAmount: boolean;
  showCategory: boolean;
  showName: boolean;
}

export const DEFAULT_SHARE_TOGGLES: ShareToggles = {
  showDate: true,
  showAmount: true,
  showCategory: true,
  showName: true,
};

export interface ShareOverlay {
  categoryText: string | null;
  amountText: string | null;
  nameText: string | null;
  dateText: string | null;
}

/** Builds the optional-info overlay for the share preview, respecting each toggle. */
export function buildShareOverlay(
  txn: Txn,
  toggles: ShareToggles,
  category: Category,
  todayKey: string,
): ShareOverlay {
  return {
    categoryText: toggles.showCategory ? categoryLabel(category) : null,
    amountText: toggles.showAmount ? signedVND(txn.amount, txn.isIncome) : null,
    nameText: toggles.showName ? (txn.note ?? txn.name) : null,
    dateText: toggles.showDate ? `${dayLabel(txn.date, todayKey)} · ${txn.time}` : null,
  };
}

/** Opens the OS share sheet for a locally-captured PNG. */
export async function shareTransactionImage(fileUri: string): Promise<void> {
  const url = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
  await Share.open({
    url,
    type: 'image/png',
    failOnCancel: false,
    // Required on Android API 30+ to share a file from the app's temp/cache dir.
    useInternalStorage: true,
  });
}
