/**
 * Offline Queue Component
 *
 * Displays and manages the offline queue of pending actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineQueue } from '../lib/offlineStorage';
import { syncManager } from '../lib/syncManager';
import { useAppStore } from '../lib/useStore';
import { haptics } from '../lib/haptics';

// ============================================================================
// Types
// ============================================================================

interface QueueItem {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

interface OfflineQueueProps {
  onDismiss?: () => void;
}

// ============================================================================
// Helper Components
// ============================================================================

function QueueItemRow({ item, onRemove }: { item: QueueItem; onRemove: (id: string) => void }) {
  const getActionLabel = (action: string): string => {
    switch (action) {
      case 'sync_request':
        return 'Pending Request';
      case 'session_message':
        return 'Message';
      case 'repository_action':
        return 'Repository Update';
      default:
        return action;
    }
  };

  const getTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}>
        <Ionicons name="time" size={20} color="#AEAEB2" />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{getActionLabel(item.action)}</Text>
        <Text style={styles.itemMeta}>
          {getTimeAgo(item.timestamp)}
          {item.retryCount > 0 && ` • Retry ${item.retryCount}`}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.itemRemove}
        onPress={() => onRemove(item.id)}
        accessibilityRole="button"
        accessibilityLabel="Remove item"
      >
        <Ionicons name="close-circle" size={24} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="cloud-done" size={48} color="#8E8E93" />
      <Text style={styles.emptyTitle}>All Synced</Text>
      <Text style={styles.emptyText}>
        No pending items. Everything is up to date.
      </Text>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OfflineQueue({ onDismiss }: OfflineQueueProps) {
  const { isOffline, sync } = useAppStore();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const items = await offlineQueue.getAll();
      setQueue(items);
    } catch (error) {
      console.error('[OfflineQueue] Load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();

    // Refresh queue every 5 seconds
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    haptics.buttonPress();
    setIsSyncing(true);

    try {
      const result = await sync();

      if (result.success) {
        haptics.success();
        await loadQueue();

        if (result.processed > 0) {
          Alert.alert(
            'Sync Complete',
            `Successfully synced ${result.processed} item${result.processed > 1 ? 's' : ''}.`
          );
        }
      } else {
        haptics.error();
        Alert.alert(
          'Sync Failed',
          result.failed > 0
            ? `${result.failed} item${result.failed > 1 ? 's' : ''} failed to sync.`
            : 'Sync failed. Please try again.'
        );
      }
    } catch (error) {
      haptics.error();
      Alert.alert('Sync Error', 'An error occurred during sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveItem = async (id: string) => {
    haptics.delete();
    Alert.alert(
      'Remove Item',
      'This will remove the item from the queue. It will not be synced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await offlineQueue.remove(id);
            await loadQueue();
            haptics.success();
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    haptics.warning();
    Alert.alert(
      'Clear All Items',
      'This will remove all pending items from the queue. They will not be synced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await offlineQueue.clear();
            await loadQueue();
            haptics.success();
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Offline Queue</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#AEAEB2" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading queue...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          Offline Queue {queue.length > 0 && `(${queue.length})`}
        </Text>
        <View style={styles.headerActions}>
          {isOffline && (
            <View style={styles.statusBadge}>
              <Ionicons name="cloud-offline" size={14} color="#FF3B30" />
              <Text style={styles.statusText}>Offline</Text>
            </View>
          )}
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#AEAEB2" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync Button */}
      {queue.length > 0 && (
        <View style={styles.syncSection}>
          <TouchableOpacity
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
            onPress={handleSync}
            disabled={isSyncing || isOffline}
            accessibilityRole="button"
            accessibilityLabel="Sync all items"
            accessibilityState={{ disabled: isSyncing || isOffline }}
          >
            {isSyncing ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.syncButtonText}>Syncing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sync" size={18} color="#FFFFFF" />
                <Text style={styles.syncButtonText}>
                  {isOffline ? 'Connect to Sync' : 'Sync All'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {queue.length > 1 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearAll}
              accessibilityRole="button"
              accessibilityLabel="Clear all items"
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Queue List */}
      {queue.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <QueueItemRow item={item} onRemove={handleRemoveItem} />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#38383A',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF3B30',
  },
  closeButton: {
    padding: 4,
  },
  syncSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#38383A',
  },
  syncButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#AEAEB2',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 13,
    color: '#AEAEB2',
  },
  itemRemove: {
    padding: 4,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
