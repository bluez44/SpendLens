import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/sl/text';

export function TodayBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Hôm nay</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: 60, left: 20,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
