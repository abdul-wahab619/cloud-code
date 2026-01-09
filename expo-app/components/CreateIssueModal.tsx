/**
 * CreateIssueModal Component
 * Modal form for creating new GitHub issues
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../lib/tokens/colors';
import { spacing, borderRadius } from '../lib/tokens/spacing';
import { Button } from './Button';
import { haptics } from '../lib/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../lib/useStore';

interface CreateIssueModalProps {
  visible: boolean;
  onClose: () => void;
  repository?: string;
  onIssueCreated?: (issue: { number: number; title: string }) => void;
}

export function CreateIssueModal({
  visible,
  onClose,
  repository,
  onIssueCreated,
}: CreateIssueModalProps) {
  const { repositories } = useAppStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(repository || repositories[0]?.full_name || '');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an issue title');
      return;
    }

    if (!selectedRepo) {
      Alert.alert('Error', 'Please select a repository');
      return;
    }

    setLoading(true);
    haptics.modalOpen();

    try {
      const isTestMode = typeof window !== 'undefined' &&
        new URL(window.location.href).searchParams.get('test') === 'true';
      const testParam = isTestMode ? '?test=true' : '';

      const response = await fetch(`/api/issues/create${testParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: selectedRepo,
          title: title.trim(),
          body: body.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create issue');
      }

      const result = await response.json();
      haptics.success();

      // Reset form
      setTitle('');
      setBody('');

      // Notify parent
      onIssueCreated?.(result);

      // Close modal
      onClose();

      Alert.alert('Success', `Issue #${result.number} created successfully!`);
    } catch (error) {
      haptics.error();
      Alert.alert('Error', 'Failed to create issue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Issue</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Form */}
          <ScrollView style={styles.form}>
            {/* Repository Selection */}
            <View style={styles.field}>
              <Text style={styles.label}>Repository</Text>
              {repositories.length > 0 ? (
                <View style={styles.repoSelector}>
                  <Text style={styles.repoText}>
                    {selectedRepo || 'Select a repository'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                </View>
              ) : (
                <Text style={styles.noRepos}>No repositories available</Text>
              )}
            </View>

            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Brief description of the issue"
                placeholderTextColor={colors.mutedForeground}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
              <Text style={styles.charCount}>{title.length}/100</Text>
            </View>

            {/* Body */}
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Detailed description of the issue..."
                placeholderTextColor={colors.mutedForeground}
                value={body}
                onChangeText={setBody}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            {/* Quick templates */}
            <View style={styles.field}>
              <Text style={styles.label}>Quick Templates</Text>
              <View style={styles.templates}>
                {['Bug', 'Feature', 'Improvement'].map(template => (
                  <Pressable
                    key={template}
                    style={styles.templateButton}
                    onPress={() => {
                      haptics.buttonPress();
                      setTitle(`${template}: `);
                    }}
                  >
                    <Text style={styles.templateText}>{template}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onClose}
              style={styles.cancelButton}
            />
            <Button
              label={loading ? 'Creating...' : 'Create Issue'}
              variant="primary"
              onPress={handleCreate}
              loading={loading}
              disabled={!title.trim() || !selectedRepo}
              haptic="none"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  closeButton: {
    padding: spacing[1],
  },
  form: {
    padding: spacing[4],
    gap: spacing[4],
  },
  field: {
    gap: spacing[2],
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  input: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    fontSize: 16,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
  },
  charCount: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'right',
    marginTop: spacing[1],
  },
  repoSelector: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  repoText: {
    fontSize: 16,
    color: colors.foreground,
  },
  noRepos: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
  templates: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  templateButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.muted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateText: {
    fontSize: 13,
    color: colors.foreground,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
  },
});
