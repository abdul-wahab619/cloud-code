import { Pressable, Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { colors } from '../lib/styles';
import { haptics } from '../lib/haptics';

interface ButtonProps {
  label?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
  size?: 'sm' | 'md' | 'lg';
  style?: any;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  haptic?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'none';
  fullWidth?: boolean;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    fontWeight: '500',
  },
  primary: { backgroundColor: colors.foreground, color: colors.background },
  secondary: { backgroundColor: colors.secondary, color: colors.foreground },
  outline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: colors.error, color: '#fff' },
  success: { backgroundColor: colors.success, color: '#fff' },
  sm: { height: 32, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  md: { height: 40, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  lg: { height: 48, paddingHorizontal: 32, paddingVertical: 12, fontSize: 16 },
  text: { fontWeight: '600' },
  icon: { marginRight: 8 },
  fullWidth: { width: '100%' },
});

const VARIANT_COLORS = {
  primary: colors.background,
  secondary: colors.foreground,
  outline: colors.foreground,
  ghost: colors.foreground,
  destructive: '#fff',
  success: '#fff',
};

const VARIANT_BGS = {
  primary: colors.primary,
  secondary: colors.secondary,
  outline: 'transparent',
  ghost: 'transparent',
  destructive: colors.error,
  success: colors.success,
};

export function Button({
  label,
  icon,
  variant = 'primary',
  size = 'md',
  style,
  disabled = false,
  loading = false,
  onPress,
  haptic = 'light',
  fullWidth = false,
}: ButtonProps) {
  const handlePress = () => {
    if (!disabled && !loading) {
      if (haptic !== 'none') {
        // Map haptic string to actual haptics method
        switch (haptic) {
          case 'light':
            haptics.buttonPress();
            break;
          case 'medium':
            haptics.modalOpen();
            break;
          case 'heavy':
            haptics.error();
            break;
          case 'success':
            haptics.success();
            break;
          case 'warning':
            haptics.warning();
            break;
          case 'error':
            haptics.error();
            break;
        }
      }
      onPress?.();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[size],
        fullWidth && styles.fullWidth,
        { backgroundColor: VARIANT_BGS[variant], opacity: (disabled || loading) ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={VARIANT_COLORS[variant]} />
      ) : (
        <>
          {icon && <View style={styles.icon}>{icon}</View>}
          {label && (
            <Text style={[styles.text, { color: VARIANT_COLORS[variant] }]}>{label}</Text>
          )}
        </>
      )}
    </Pressable>
  );
}
