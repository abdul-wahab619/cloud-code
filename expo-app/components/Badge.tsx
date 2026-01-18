import { Text, View, StyleSheet } from 'react-native';
import { colors } from '../lib/styles';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning';
  style?: any;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

const VARIANT_COLORS = {
  default: { bg: colors.foreground, text: colors.background },
  secondary: { bg: colors.secondary, text: colors.foreground },
  outline: { bg: 'transparent', text: colors.foreground, border: colors.border },
  destructive: { bg: colors.error, text: '#fff' },
  success: { bg: colors.success, text: '#fff' },
  warning: { bg: colors.warning, text: '#fff' },
};

export function Badge({ label, variant = 'default', style }: BadgeProps) {
  const colors = VARIANT_COLORS[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg },
        variant === 'outline' && 'border' in colors && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}
