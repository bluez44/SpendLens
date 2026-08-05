import { Stack, router } from 'expo-router';
import { useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SubscriptionRow } from '@/components/sl/subscription-row';
import {
  SubscriptionSheet, type SubscriptionSheetHandle,
} from '@/components/sl/subscription-sheet';
import { Text } from '@/components/sl/text';
import { useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import type { NewSubscription, Subscription } from '@/lib/subscriptions';
import { useSubscriptions } from '@/lib/subscriptions-context';

export default function SubscriptionsScreen() {
  const c = useColors();
  const { t } = useT();
  const { settings, rates } = useSettings();
  const { subscriptions, add, update, remove, pause, resume } = useSubscriptions();
  const sheetRef = useRef<SubscriptionSheetHandle>(null);

  const onSave = async (input: NewSubscription, id?: number) => {
    try {
      if (id !== undefined) await update(id, input);
      else await add(input);
    } catch (err) {
      console.warn('Failed to save subscription', err);
      Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
      throw err;
    }
  };

  const onDelete = async (id: number) => {
    Alert.alert(
      t('sub.delete_confirm_title'),
      t('sub.delete_confirm_body'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(id);
            } catch (err) {
              console.warn('Failed to delete subscription', err);
              Alert.alert(t('common.delete_failed_title'), t('common.delete_failed_body'));
            }
          },
        },
      ],
    );
  };

  const onPauseResume = async (id: number, wantPause: boolean) => {
    try {
      if (wantPause) await pause(id);
      else await resume(id);
    } catch (err) {
      console.warn('Failed to toggle subscription pause', err);
      Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
    }
  };

  const openAdd = () => sheetRef.current?.presentAdd();
  const openEdit = (sub: Subscription) => sheetRef.current?.presentEdit(sub);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: t('sub.list_title'),
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={openAdd} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>＋</Text>
            </Pressable>
          ),
        }}
      />
      {subscriptions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={{ color: c.textSecondary }}>{t('sub.empty_state')}</Text>
        </View>
      ) : (
        <ScrollView>
          {subscriptions.map((s) => (
            <SubscriptionRow
              key={s.id}
              subscription={s}
              primary={settings.primaryCurrency}
              rates={rates}
              onPress={openEdit}
            />
          ))}
        </ScrollView>
      )}
      <SubscriptionSheet
        ref={sheetRef}
        onSave={onSave}
        onDelete={onDelete}
        onPauseResume={onPauseResume}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
