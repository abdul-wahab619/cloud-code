# Changelog

All notable changes to the Cloud Code mobile app will be documented in this file.

## [Unreleased]

### Added (2026-01-09)

#### User Accounts & Authentication (Sprint 3) - IN PROGRESS
- **NEW: User Account System** - Users can now create accounts and sign in
  - Account types: Free (10 sessions/mo, 3 repos), Pro (100 sessions/mo, 50 repos), Enterprise (unlimited)
  - Email/password authentication with secure token storage
  - Usage tracking for sessions and repositories
  - Account settings with profile management
  - Tier badge display and upgrade prompts
  - Sign in/Register modal with form validation

#### Session History Modal
- **NEW: Session History Modal** - Users can now browse and access historical chat sessions
  - Search and filter sessions by title or ID
  - Date grouping (Today, Yesterday, This Week, Older)
  - Swipe-to-delete functionality
  - Session preview with title, message count, token count, and timestamp
  - Empty state handling for no history
  - Loading states and error handling
  - Full accessibility support with proper labels and hints

#### Sessions Screen Enhancements
- **History Button** - Added clock icon button to sessions header for accessing session history
  - Visible at all times (not just when there are messages)
  - Shows session count in accessibility hint

#### Backend Integration
- **Load Session** - Load any historical session into the current chat view
- **Delete Session** - Remove sessions from history with confirmation dialog
- **Error Handling** - Proper error logging for corrupted or missing sessions using ErrorIds

### Technical Details

#### New Files
- `expo-app/components/SessionHistoryModal.tsx` - Session history browsing modal component
- `expo-app/services/AnalyticsService.ts` - Analytics event tracking service
- `expo-app/contexts/AnalyticsContext.tsx` - React context provider for analytics
- `expo-app/components/AccountSettings.tsx` - User account settings component
- `expo-app/components/AuthModal.tsx` - Login/Register authentication modal
- `expo-app/lib/userService.ts` - User authentication and profile service

#### Modified Files
- `expo-app/app/(tabs)/sessions.tsx` - Integrated history modal, added handlers
- `expo-app/app/(tabs)/settings.tsx` - Integrated account settings and analytics controls
- `expo-app/lib/types.ts` - Added UserAccount, AuthTokens, and related types
- `expo-app/lib/useStore.ts` - Added user authentication state and actions
- `expo-app/lib/api.ts` - Exported apiClient for use in userService
- `expo-app/index.tsx` - Added error handling to app entry point

#### Features
- Search with real-time filtering
- Date-based grouping (Today, Yesterday, This Week, Older)
- Swipe-to-delete with confirmation
- Haptic feedback for all interactions
- Animated modal transitions
- Collapsible date groups
- Empty states for no history and no search results

### Accessibility
- All interactive elements have proper accessibility labels
- Screen reader support with descriptive hints
- Haptic feedback for touch interactions
- Proper touch target sizes (44pt minimum)

---

## Previous Releases
