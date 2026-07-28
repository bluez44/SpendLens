import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { Money, useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { useSync } from '@/lib/sync/sync-context';

export function SyncStatusRow() {
  const { t } = useT();
  const c = useColors();
  const { state, lastError, lastSyncedAt } = useSync();

  let body;
  if (state === 'syncing') {
    body = (
      <>
        <ActivityIndicator size="small" />
        <Text style={{ color: c.textSecondary, marginLeft: 8 }}>{t('sync.status_syncing')}</Text>
      </>
    );
  } else if (state === 'error') {
    body = <Text style={{ color: Money.expense }}>{t('sync.status_error', { msg: lastError?.message ?? '' })}</Text>;
  } else if (state === 'token-expired') {
    body = <Text style={{ color: Money.expense }}>{t('sync.status_token_expired')}</Text>;
  } else if (lastSyncedAt) {
    body = <Text style={{ color: c.textSecondary }}>{t('sync.status_synced', { time: new Date(lastSyncedAt).toLocaleTimeString() })}</Text>;
  } else {
    body = <Text style={{ color: c.textSecondary }}>{t('sync.status_never')}</Text>;
  }

  return <View style={styles.row}>{body}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
});
