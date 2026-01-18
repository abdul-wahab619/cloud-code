/**
 * BranchSelector Component
 *
 * Allows users to select a non-default branch for sessions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { colors } from '../lib/tokens/colors';
import { spacing, borderRadius } from '../lib/tokens/spacing';
import { fontFamily, fontSize, fontWeight } from '../lib/tokens/typography';
import { Button } from './Button';
import { Badge } from './Badge';
import { haptics } from '../lib/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../lib/useStore';

// ============================================================================
// Types
// ============================================================================

export interface GitBranch {
  name: string;
  protected: boolean;
  default: boolean;
  commit?: {
    sha: string;
    message: string;
    author: string;
    date: string;
  };
}

interface BranchSelectorProps {
  visible: boolean;
  onClose: () => void;
  repository: string;
  onSelectBranch: (branch: string) => void;
  currentBranch?: string;
}

interface CachedBranches {
  [repository: string]: {
    branches: GitBranch[];
    timestamp: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = 'branch_cache';

// ============================================================================
// Component
// ============================================================================

export function BranchSelector({
  visible,
  onClose,
  repository,
  onSelectBranch,
  currentBranch,
}: BranchSelectorProps) {
  const { getToken } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [filteredBranches, setFilteredBranches] = useState<GitBranch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && repository) {
      loadBranches();
    }
  }, [visible, repository]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = branches.filter((branch) =>
        branch.name.toLowerCase().includes(query)
      );
      setFilteredBranches(filtered);
    } else {
      setFilteredBranches(branches);
    }
  }, [searchQuery, branches]);

  const loadBranches = async () => {
    setLoading(true);
    setError(null);
    setSearchQuery('');

    try {
      // Check cache first
      const cached = await getCachedBranches(repository);
      if (cached) {
        setBranches(cached);
        setFilteredBranches(cached);
        setLoading(false);
        return;
      }

      // Fetch from GitHub
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(
        `https://api.github.com/repos/${repository}/branches?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      const branchData: GitBranch[] = data.map((branch: any) => ({
        name: branch.name,
        protected: branch.protected || false,
        default: branch.name === (data.find((b: any) => b.name)?.name || 'main'),
        commit: branch.commit
          ? {
              sha: branch.commit.sha.substring(0, 7),
              message: '', // Would need additional API call
              author: '',
              date: '',
            }
          : undefined,
      }));

      // Sort: default branch first, then protected branches, then alphabetically
      branchData.sort((a, b) => {
        if (a.default) return -1;
        if (b.default) return 1;
        if (a.protected && !b.protected) return -1;
        if (!a.protected && b.protected) return 1;
        return a.name.localeCompare(b.name);
      });

      setBranches(branchData);
      setFilteredBranches(branchData);

      // Cache the results
      await cacheBranches(repository, branchData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = (branchName: string) => {
    haptics.buttonPress();
    onSelectBranch(branchName);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Select Branch</Text>
          <Pressable onPress={loadBranches} style={styles.headerButton}>
            <Ionicons name="refresh-outline" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Repository Info */}
        <View style={styles.repoInfo}>
          <Text style={styles.repoLabel}>{repository}</Text>
          {currentBranch && (
            <Badge variant="outline" size="sm">
              Current: {currentBranch}
            </Badge>
          )}
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.loadingText}>Loading branches...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.destructive} />
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <Button variant="outline" onPress={loadBranches} style={{ marginTop: spacing.lg }}>
              Retry
            </Button>
          </View>
        ) : (
          <>
            {/* Search */}
            {branches.length > 10 && (
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={20}
                  color={colors.mutedForeground}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search branches..."
                  placeholderTextColor={colors.mutedForeground}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <Pressable
                    style={styles.clearButton}
                    onPress={() => setSearchQuery('')}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
            )}

            {/* Branches List */}
            <ScrollView style={styles.branchList} contentContainerStyle={styles.branchListContent}>
              {filteredBranches.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="git-branch-outline" size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyText}>No branches found</Text>
                </View>
              ) : (
                filteredBranches.map((branch) => (
                  <Pressable
                    key={branch.name}
                    style={styles.branchItem}
                    onPress={() => handleSelectBranch(branch.name)}
                  >
                    <View style={styles.branchInfo}>
                      <View style={styles.branchHeader}>
                        <Ionicons
                          name="git-branch"
                          size={20}
                          color={branch.default ? colors.brand : colors.mutedForeground}
                        />
                        <Text style={styles.branchName}>{branch.name}</Text>
                        {branch.default && (
                          <Badge variant="success" size="sm">Default</Badge>
                        )}
                        {branch.protected && !branch.default && (
                          <Badge variant="secondary" size="sm">
                            <Ionicons name="shield-checkmark" size={12} />
                          </Badge>
                        )}
                      </View>
                      {branch.commit && (
                        <Text style={styles.commitSha}>{branch.commit.sha}</Text>
                      )}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

// ============================================================================
// Cache Functions
// ============================================================================

async function getCachedBranches(repository: string): Promise<GitBranch[] | null> {
  try {
    const cached = await getCachedData();
    const entry = cached[repository];
    if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
      return entry.branches;
    }
    return null;
  } catch {
    return null;
  }
}

async function cacheBranches(repository: string, branches: GitBranch[]): Promise<void> {
  try {
    const cached = await getCachedData();
    cached[repository] = {
      branches,
      timestamp: Date.now(),
    };

    // Clean up old entries
    const now = Date.now();
    for (const key in cached) {
      if (now - cached[key].timestamp > CACHE_DURATION) {
        delete cached[key];
      }
    }

    // Save to storage (would need storage import here)
    // await storage.set(CACHE_KEY, cached);
  } catch (error) {
    console.error('[BranchSelector] Failed to cache branches:', error);
  }
}

async function getCachedData(): Promise<CachedBranches> {
  try {
    // Would need storage import here
    // return await storage.get<CachedBranches>(CACHE_KEY) || {};
    return {};
  } catch {
    return {};
  }
}

// ============================================================================
// Standalone Branch Selector Component
// ============================================================================

export function BranchPicker({
  repository,
  currentBranch,
  onSelectBranch,
  buttonLabel = 'Select Branch',
}: {
  repository: string;
  currentBranch?: string;
  onSelectBranch: (branch: string) => void;
  buttonLabel?: string;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onPress={() => {
          haptics.buttonPress();
          setModalVisible(true);
        }}
        icon={<Ionicons name="git-branch" size={18} color={colors.foreground} />}
      >
        {buttonLabel}
      </Button>

      <BranchSelector
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        repository={repository}
        onSelectBranch={onSelectBranch}
        currentBranch={currentBranch}
      />
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  repoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  repoLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.foreground,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.mutedForeground,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing.md,
  },
  errorMessage: {
    fontSize: fontSize.md,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.foreground,
    paddingVertical: spacing.xs,
  },
  clearButton: {
    padding: spacing.xs,
  },
  branchList: {
    flex: 1,
  },
  branchListContent: {
    padding: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.mutedForeground,
  },
  branchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  branchInfo: {
    flex: 1,
  },
  branchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  branchName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.foreground,
  },
  commitSha: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    fontFamily: fontFamily.mono,
  },
});
