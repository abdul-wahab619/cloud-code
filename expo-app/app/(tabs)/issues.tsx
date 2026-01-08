import { useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { useAppStore } from '../../lib/useStore';
import { Badge } from '../../components/Badge';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { colors } from '../../lib/styles';
import { Ionicons } from '@expo/vector-icons';

const FILTERS = ['All', 'Open', 'Processing', 'Completed'] as const;

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  issueCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusIndicator: {
    width: 8,
    borderRadius: 4,
  },
  issueContent: { flex: 1 },
  issueTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: 4,
  },
  issueBody: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  issueMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  issueNumber: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
  },
  issueRepo: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
});

const STATUS_COLORS = {
  open: colors.success,
  closed: colors.mutedForeground,
} as const;

function IssuesScreenContent() {
  const { issues, isLoading, refresh, selectedIssueFilter, setSelectedIssueFilter } = useAppStore();

  useEffect(() => {
    refresh();
  }, []);

  const filteredIssues = issues.filter((issue) => {
    if (selectedIssueFilter === 'All') return true;
    if (selectedIssueFilter === 'Open') return issue.state === 'open';
    if (selectedIssueFilter === 'Processing') return issue.status === 'processing';
    if (selectedIssueFilter === 'Completed') return issue.status === 'completed';
    return true;
  });

  return (
    <ScrollView
      style={styles.flex1}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#6366f1" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>GitHub Issues</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setSelectedIssueFilter(filter as any)}
            style={[
              styles.filterButton,
              {
                backgroundColor:
                  selectedIssueFilter === filter ? colors.brand : colors.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                {
                  color:
                    selectedIssueFilter === filter
                      ? colors.background
                      : colors.foreground,
                },
              ]}
            >
              {filter}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Issues List */}
      <View style={styles.content}>
        {!filteredIssues.length ? (
          <View style={styles.emptyState}>
            <Ionicons name="git-branch-outline" size={48} color="#71717a" />
            <Text style={styles.emptyText}>No issues found</Text>
            <Text style={styles.emptySubtext}>
              {selectedIssueFilter === 'All'
                ? 'Issues will appear here when created in your connected repository'
                : `No ${selectedIssueFilter.toLowerCase()} issues`}
            </Text>
          </View>
        ) : (
          filteredIssues.map((issue) => (
            <View
              key={issue.id ?? issue.number}
              style={styles.issueCard}
            >
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: issue.state === 'open' ? colors.success : colors.mutedForeground },
                ]}
              />
              <View style={styles.issueContent}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <Text style={styles.issueTitle}>{issue.title}</Text>
                  <Badge
                    label={issue.state === 'open' ? 'Open' : 'Closed'}
                    variant={issue.state === 'open' ? 'success' : 'secondary'}
                  />
                </View>
                <Text style={styles.issueBody}>{issue.body ?? 'No description'}</Text>
                <View style={styles.issueMeta}>
                  <Text style={styles.issueNumber}>#{issue.number}</Text>
                  {issue.repository && (
                    <Text style={styles.issueRepo}>{issue.repository}</Text>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

export default function IssuesScreen() {
  return (
    <ErrorBoundary>
      <IssuesScreenContent />
    </ErrorBoundary>
  );
}
