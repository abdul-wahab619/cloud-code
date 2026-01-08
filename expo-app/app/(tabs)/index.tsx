import { useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useAppStore } from '../../lib/useStore';
import { Card } from '../../components/Card';
import { StatusDot } from '../../components/StatusDot';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { formatTime } from '../../lib/utils';
import { colors, commonStyles } from '../../lib/styles';
import { Ionicons } from '@expo/vector-icons';

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});

const STATUS_COLORS = {
  pending: '#eab308',
  running: '#6366f1',
  completed: '#22c55e',
  failed: '#ef4444',
} as const;

function DashboardScreenContent() {
  const { stats, tasks, sessions, isLoading, refresh } = useAppStore();

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ScrollView
      style={styles.flex1}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#6366f1" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cube" size={24} color="#6366f1" />
          <Text style={styles.headerTitle}>Claude Pipeline</Text>
        </View>
        <View style={{ padding: 8 }} onStartShouldSetResponder={() => true} onTouchEnd={refresh}>
          <Ionicons name="refresh-outline" size={20} color="#71717a" />
        </View>
      </View>

      <View style={styles.content}>
        {/* Stats Cards */}
        <StatsSection />

        {/* Active Tasks */}
        <TasksSection />

        {/* Recent Activity */}
        <ActivitySection />
      </View>
    </ScrollView>
  );
}

function StatsSection() {
  const { stats } = useAppStore();

  if (!stats) {
    return (
      <View style={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.statCard, { height: 80 }]} />
        ))}
      </View>
    );
  }

  const statsData = [
    { label: 'Processed', value: stats.processedIssues ?? 0, color: '#6366f1' },
    { label: 'Success', value: `${stats.successRate ?? 0}%`, color: '#22c55e' },
    { label: 'Active', value: stats.activeSessions ?? 0, color: '#eab308' },
    { label: 'Total', value: stats.totalIssues ?? 0, color: '#a1a1aa' },
  ];

  return (
    <View style={styles.statsGrid}>
      {statsData.map((stat) => (
        <View key={stat.label} style={styles.statCard}>
          <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
          <Text style={styles.statLabel}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TasksSection() {
  const { tasks } = useAppStore();

  if (!tasks.length) {
    return (
      <Card title="Active Tasks">
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active tasks</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card title="Active Tasks">
      {tasks.map((task) => (
        <View
          key={task.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <StatusDot status={task.status as any} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.foreground }}>
                {task.title}
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{task.repository}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
            {formatTime(task.createdAt)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function ActivitySection() {
  const { sessions } = useAppStore();

  if (!sessions.length) {
    return (
      <Card title="Recent Activity">
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No recent activity</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card title="Recent Activity">
      {sessions.slice(0, 5).map((session) => (
        <View
          key={session.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 8,
          }}
        >
          <StatusDot status={session.status as any} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: colors.foreground }}>{session.prompt}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
              {formatTime(session.createdAt)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function DashboardScreen() {
  return (
    <ErrorBoundary>
      <DashboardScreenContent />
    </ErrorBoundary>
  );
}
