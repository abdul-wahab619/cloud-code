/**
 * Offline Banner Component
 *
 * Displays a banner when offline with sync status and queue info.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../lib/useStore';
import { syncManager } from '../lib/syncManager';
import { offlineQueue } from '../lib/offlineStorage';
import { haptics } from '../lib/haptics';

// ============================================================================
// Types
// ============================================================================

interface OfflineBannerProps {
  onSyncPress?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function OfflineBanner({ onSyncPress }: OfflineBannerProps) {
  const { isOffline, isSyncing, sync } = useAppStore();
  const [queueLength, setQueueLength] = useState(0);

  // Update queue length periodically
  useEffect(() => {
    const updateQueue = async () => {
      const queue = await offlineQueue.getAll();
      setQueueLength(queue.length);
    };

    updateQueue();
    const interval = setInterval(updateQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncPress = async () => {
    haptics.buttonPress();
    onSyncPress?.();

    // Trigger sync
    await sync();
  };

  // Show syncing indicator when active
  if (isSyncing) {
    return (
      <View style={[styles.container, styles.syncing]}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={styles.text}>Syncing...</Text>
      </View>
    );
  }

  // Show offline banner
  if (isOffline) {
    return (
      <View style={[styles.container, styles.offline]}>
        <Ionicons name="cloud-offline" size={16} color="#FFFFFF" />
        <Text style={styles.text}>
          You're offline
          {queueLength > 0 && ` • ${queueLength} item${queueLength > 1 ? 's' : ''} queued`}
        </Text>
        {queueLength > 0 && (
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleSyncPress}
            accessibilityRole="button"
            accessibilityLabel="Sync now"
          >
            <Text style={styles.syncButtonText}>Sync</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Show items pending sync indicator
  if (queueLength > 0) {
    return (
      <View style={[styles.container, styles.pending]}>
        <Ionicons name="time" size={16} color="#FFFFFF" />
        <Text style={styles.text}>
          {queueLength} item{queueLength > 1 ? 's' : ''} pending sync
        </Text>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSyncPress}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
        >
          <Text style={styles.syncButtonText}>Sync</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  offline: {
    backgroundColor: '#FF3B30',
  },
  syncing: {
    backgroundColor: '#007AFF',
  },
  pending: {
    backgroundColor: '#FF9500',
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
