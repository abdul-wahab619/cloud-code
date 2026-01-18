/**
 * SuccessChart Component
 * Donut chart showing success/failure rate
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../lib/tokens/colors';

interface SuccessChartProps {
  success: number;
  failure: number;
  size?: number;
  strokeWidth?: number;
}

export function SuccessChart({
  success,
  failure,
  size = 80,
  strokeWidth = 8,
}: SuccessChartProps) {
  const total = success + failure;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const successPercentage = total > 0 ? success / total : 0;
  const successStrokeDasharray = circumference * successPercentage;
  const successStrokeDashoffset = circumference - successStrokeDasharray;

  const failurePercentage = total > 0 ? failure / total : 0;
  const failureStrokeDasharray = circumference * failurePercentage;
  const failureStrokeDashoffset = circumference - failureStrokeDasharray - successStrokeDasharray;

  const percentage = Math.round(successPercentage * 100);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.muted}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Success arc */}
        {success > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.success}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${successStrokeDasharray} ${circumference}`}
            strokeDashoffset={successStrokeDashoffset}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        )}

        {/* Failure arc */}
        {failure > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.error}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${failureStrokeDasharray} ${circumference}`}
            strokeDashoffset={failureStrokeDashoffset}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>

      {/* Percentage text */}
      <View style={styles.textContainer}>
        <Text style={styles.percentage}>{percentage}%</Text>
        <Text style={styles.label}>Success</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  label: {
    fontSize: 10,
    color: colors.mutedForeground,
  },
});
