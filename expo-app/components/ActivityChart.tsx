/**
 * ActivityChart Component
 * Line chart showing session activity over time
 */

import React from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import { VictoryLine, VictoryChart } from 'victory-native';
import { colors } from '../lib/tokens/colors';

interface ActivityChartProps {
  data: Array<{ date: string; count: number }>;
  color?: string;
  height?: number;
}

export function ActivityChart({ data, color = colors.primary, height = 120 }: ActivityChartProps) {
  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No activity data</Text>
      </View>
    );
  }

  const chartData = data.map((d, i) => ({ x: i, y: d.count }));
  const width = Dimensions.get('window').width - 32;

  return (
    <View style={[styles.container, { height }]}>
      <VictoryChart
        width={width}
        height={height}
        animate={{ duration: 300 }}
      >
        <VictoryLine
          data={chartData}
          style={{
            data: {
              stroke: color,
              strokeWidth: 2,
            },
          }}
          interpolation="monotoneX"
        />
      </VictoryChart>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    flex: 1,
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: 14,
  },
});
