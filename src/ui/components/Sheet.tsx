import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { RADIUS } from '../theme';
import type { Theme } from '../theme';

/**
 * Bottom sheet. 28 px top corners, scrim dismiss, 220 ms rise.
 * Content scrolls itself; the sheet caps at 92% of the screen.
 */
export function Sheet(props: {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  children: React.ReactNode;
}) {
  const { visible, onClose, theme, children } = props;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, rise]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              opacity: rise,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.line }]} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
  },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
});
