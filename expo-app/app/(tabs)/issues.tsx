import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, TextInput } from 'react-native';
import { useAppStore } from '../../lib/useStore';
import { Badge } from '../../components/Badge';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { CreateIssueModal } from '../../components/CreateIssueModal';
import { PRDetailModal } from '../../components/PRDetailModal';
import { IssueDetailModal } from '../../components/IssueDetailModal';
import { SwipeableItem } from '../../components/SwipeableItem';
import { PullToRefresh } from '../../components/PullToRefresh';
import { colors } from '../../lib/styles';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../../lib/haptics';

const FILTERS = ['All', 'Open', 'Processing', 'Completed'] as const;

interface SelectedIssue {
  number: number;
  repository: string;
  isPR?: boolean;
}

interface SelectedPR {
  number: number;
  repository: string;
}

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
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInputFocused: {
    borderColor: colors.brand,
  },
  clearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
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
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  swipeActionIcon: {
    marginBottom: 4,
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  deleteSwipeAction: {
    backgroundColor: colors.error,
  },
  viewSwipeAction: {
    backgroundColor: colors.brand,
  },
});

const STATUS_COLORS = {
  open: colors.success,
  closed: colors.mutedForeground,
} as const;

function IssuesScreenContent() {
  const {
    issues,
    isLoading,
    refresh,
    selectedIssueFilter,
    setSelectedIssueFilter,
    repositories,
  } = useAppStore();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedPR, setSelectedPR] = useState<SelectedPR | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<SelectedIssue | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  const filteredIssues = issues.filter((issue) => {
    // Filter by status
    if (selectedIssueFilter === 'Open') return issue.state === 'open';
    if (selectedIssueFilter === 'Processing') return issue.status === 'processing';
    if (selectedIssueFilter === 'Completed') return issue.status === 'completed';

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        issue.title.toLowerCase().includes(query) ||
        (issue.body && issue.body.toLowerCase().includes(query)) ||
        `#${issue.number}`.includes(query) ||
        (issue.repository && issue.repository.toLowerCase().includes(query))
      );
    }

    return true;
  });

  const handleCreateIssue = useCallback(() => {
    haptics.modalOpen();
    setCreateModalVisible(true);
  }, []);

  const handleIssueCreated = useCallback((issue: { number: number; title: string }) => {
    refresh();
    Alert.alert('Success', `Issue #${issue.number} created successfully!`);
  }, [refresh]);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleViewPR = useCallback((prNumber: number, repository: string, isPR?: boolean) => {
    haptics.buttonPress();
    if (isPR) {
      setSelectedPR({ number: prNumber, repository });
    } else {
      setSelectedIssue({ number: prNumber, repository, isPR: false });
    }
  }, []);

  const handleSwipeAction = useCallback((issue: any, action: string) => {
    haptics.modalOpen();
    if (action === 'view') {
      // Navigate to issue details or PR details
      handleViewPR(issue.number, issue.repository || '', issue.isPR);
    } else if (action === 'delete') {
      Alert.alert(
        'Delete Issue',
        `Are you sure you want to delete issue #${issue.number}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              // Handle delete logic
              haptics.error();
            },
          },
        ]
      );
    }
  }, [handleViewPR]);

  return (
    <>
      <PullToRefresh onRefresh={handleRefresh} refreshing={isLoading}>
        <ScrollView style={styles.flex1}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>GitHub Issues</Text>
            <Pressable style={styles.headerButton} onPress={handleCreateIssue}>
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={styles.searchRow}>
            <Ionicons
              name="search"
              size={20}
              color={searchFocused ? colors.brand : colors.mutedForeground}
              style={{ marginLeft: 4 }}
            />
            <TextInput
              style={[styles.searchInput, searchFocused && styles.searchInputFocused]}
              placeholder="Search issues..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchQuery.length > 0 && (
              <Pressable
                style={styles.clearButton}
                onPress={() => {
                  haptics.buttonPress();
                  setSearchQuery('');
                }}
              >
                <Ionicons name="close" size={18} color={colors.foreground} />
              </Pressable>
            )}
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
                <SwipeableItem
                  key={issue.id ?? issue.number}
                  leftActions={[
                    {
                      icon: 'eye',
                      label: 'View',
                      color: colors.brand,
                      backgroundColor: colors.brand,
                      onPress: () => handleSwipeAction(issue, 'view'),
                    },
                  ]}
                  rightActions={[
                    {
                      icon: 'close',
                      label: 'Delete',
                      color: colors.error,
                      backgroundColor: colors.error,
                      onPress: () => handleSwipeAction(issue, 'delete'),
                    },
                  ]}
                  onSwipeStart={() => haptics.buttonPress()}
                >
                  <View style={styles.issueCard}>
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
                </SwipeableItem>
              ))
            )}
          </View>
        </ScrollView>
      </PullToRefresh>

      {/* Create Issue Modal */}
      <CreateIssueModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onIssueCreated={handleIssueCreated}
      />

      {/* PR Detail Modal */}
      {selectedPR && (
        <PRDetailModal
          visible={!!selectedPR}
          onClose={() => setSelectedPR(null)}
          prNumber={selectedPR.number}
          repository={selectedPR.repository}
        />
      )}

      {/* Issue Detail Modal */}
      {selectedIssue && (
        <IssueDetailModal
          visible={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          issueNumber={selectedIssue.number}
          repository={selectedIssue.repository}
        />
      )}
    </>
  );
}

export default function IssuesScreen() {
  return (
    <ErrorBoundary>
      <IssuesScreenContent />
    </ErrorBoundary>
  );
}
