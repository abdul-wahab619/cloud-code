/**
 * StatsCard Component
 * Interactive stat card with detail view on tap
 */

import React, { useState } from 'react';
import { View, StyleSheet, Text, Modal, Pressable, ScrollView } from 'react-native';
import { colors } from '../lib/tokens/colors';
import { spacing, borderRadius } from '../lib/tokens/spacing';
import { Card } from './Card';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: string;
  details?: Array<{ label: string; value: string | number }>;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  color = colors.primary,
  details,
}: StatsCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handlePress = () => {
    if (details && details.length > 0) {
      haptics.buttonPress();
      setShowDetails(true);
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return 'trending-up';
      case 'down':
        return 'trending-down';
      default:
        return 'trending-flat';
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return colors.success;
      case 'down':
        return colors.error;
      default:
        return colors.mutedForeground;
    }
  };

  return (
    <>
      <Pressable onPress={handlePress} disabled={!details || details.length === 0}>
        <Card
          variant="flat"
          style={[styles.card, !!details && styles.interactive]}
          onPress={handlePress}
          haptic="none"
        >
          <View style={styles.content}>
            {icon && (
              <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
                <Ionicons name={icon as any} size={20} color={color} />
              </View>
            )}
            <View style={styles.textContainer}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.valueRow}>
                <Text style={[styles.value, { color }]}>
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </Text>
                {trend && (
                  <View style={styles.trendContainer}>
                    <Ionicons
                      name={getTrendIcon() as any}
                      size={14}
                      color={getTrendColor()}
                    />
                    {trendValue && (
                      <Text style={[styles.trendValue, { color: getTrendColor() }]}>
                        {trendValue}
                      </Text>
                    )}
                  </View>
                )}
              </View>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {details && details.length > 0 && (
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            )}
          </View>
        </Card>
      </Pressable>

      {/* Detail Modal */}
      <Modal
        visible={showDetails}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDetails(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDetails(false)}
        >
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title} Details</Text>
              <Pressable onPress={() => setShowDetails(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {details?.map((detail, index) => (
                <View key={index} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{detail.label}</Text>
                  <Text style={styles.detailValue}>
                    {typeof detail.value === 'number' ? detail.value.toLocaleString() : detail.value}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[3],
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  interactive: {
    borderColor: `${colors.primary}40`,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: spacing[0.5],
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[0.5],
  },
  trendValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: spacing[0.5],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  modalBody: {
    padding: spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
});
