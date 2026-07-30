import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';

export function Toast(props: { message: string | null; theme: Theme; bottom?: number }) {
  if (!props.message) return null;
  return (
    <View style={[styles.wrap, { backgroundColor: props.theme.text, bottom: props.bottom ?? 118 }]}>
      <Text style={[styles.text, { color: props.theme.bg }]}>{props.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  text: { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 17 },
});
