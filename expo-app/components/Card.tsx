import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../lib/styles';
import { haptics } from '../lib/haptics';
import { borderRadius, spacing } from '../lib/tokens/spacing';

export type CardVariant = 'default' | 'outlined' | 'elevated' | 'flat';
export type CardSize = 'sm' | 'md' | 'lg';

interface CardProps {
  title?: string;
  subtitle?: string;
  style?: any;
  children: React.ReactNode;
  variant?: CardVariant;
  size?: CardSize;
  onPress?: () => void;
  disabled?: boolean;
  haptic?: 'light' | 'medium' | 'none';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSm: {
    padding: spacing[3],
  },
  cardMd: {
    padding: spacing[4],
  },
  cardLg: {
    padding: spacing[5],
  },
  default: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  elevated: {
    backgroundColor: colors.card,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  flat: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
  },
  pressable: {
    cursor: 'pointer',
  },
  header: {
    marginBottom: spacing[3],
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: spacing[0.5],
  },
  titleSm: {
    fontSize: 16,
  },
  titleLg: {
    fontSize: 20,
  },
});

export function Card({
  title,
  subtitle,
  style,
  children,
  variant = 'default',
  size = 'md',
  onPress,
  disabled = false,
  haptic = 'light',
}: CardProps) {
  const cardStyle = [
    styles.card,
    styles[variant],
    size === 'sm' && styles.cardSm,
    size === 'md' && styles.cardMd,
    size === 'lg' && styles.cardLg,
  ];

  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? {
        onPress: () => {
          if (!disabled && haptic !== 'none') {
            haptics[haptic]();
          }
          onPress();
        },
        disabled,
        style: ({ pressed }: { pressed: boolean }) => [
          cardStyle,
          style,
          styles.pressable,
          { opacity: pressed ? 0.8 : 1, opacity: disabled ? 0.5 : 1 },
        ],
      }
    : { style: [cardStyle, style] };

  return (
    <Wrapper {...wrapperProps}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && (
            <Text style={[styles.title, size === 'sm' && styles.titleSm, size === 'lg' && styles.titleLg]}>
              {title}
            </Text>
          )}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      {children}
    </Wrapper>
  );
}

export function CardContent({ style, children }: { style?: any; children: React.ReactNode }) {
  return <View style={style}>{children}</View>;
}

export function CardRow({
  style,
  children,
  justify = 'space-between',
}: {
  style?: any;
  children: React.ReactNode;
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: justify }, style]}>
      {children}
    </View>
  );
}
