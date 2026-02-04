/**
 * NotificationSettings Component
 *
 * UI component for managing browser notification preferences.
 * Displays permission state and allows users to toggle notifications on/off.
 */

'use client';

import { useCallback } from 'react';

interface NotificationSettingsProps {
  className?: string;
  permission: 'default' | 'granted' | 'denied';
  enabled: boolean;
  isSupported: boolean;
  onRequestPermission: () => Promise<void>;
  onToggleEnabled: (enabled: boolean) => void;
}

export function NotificationSettings({
  className = '',
  permission,
  enabled,
  isSupported,
  onRequestPermission,
  onToggleEnabled,
}: NotificationSettingsProps) {
  const handleToggle = useCallback(() => {
    if (permission === 'granted') {
      onToggleEnabled(!enabled);
    } else if (permission === 'default') {
      // Request permission when user tries to enable
      onRequestPermission();
    }
  }, [permission, enabled, onRequestPermission, onToggleEnabled]);

  // Don't show if notifications are not supported
  if (!isSupported) {
    return null;
  }

  // Show different UI based on permission state
  const getPermissionText = () => {
    switch (permission) {
      case 'granted':
        return enabled ? 'Notifications enabled' : 'Notifications disabled';
      case 'denied':
        return 'Notifications blocked';
      case 'default':
        return 'Enable notifications';
    }
  };

  const getPermissionIcon = () => {
    switch (permission) {
      case 'granted':
        return enabled ? '🔔' : '🔕';
      case 'denied':
        return '🚫';
      case 'default':
        return '🔔';
    }
  };

  const isDisabled = permission === 'denied';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleToggle}
        disabled={isDisabled}
        className={`
          flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium
          transition-colors
          ${
            isDisabled
              ? 'cursor-not-allowed bg-bg-secondary text-text-disabled'
              : enabled && permission === 'granted'
              ? 'bg-accent/10 text-accent hover:bg-accent/20'
              : 'border border-border text-text-secondary hover:bg-bg-hover'
          }
        `}
        title={
          permission === 'denied'
            ? 'Notifications blocked. Check your browser settings.'
            : permission === 'default'
            ? 'Click to enable browser notifications'
            : enabled
            ? 'Click to disable notifications'
            : 'Click to enable notifications'
        }
      >
        <span className="text-base leading-none">{getPermissionIcon()}</span>
        <span>{getPermissionText()}</span>
      </button>

      {permission === 'denied' && (
        <div className="text-xs text-text-disabled">
          Enable in browser settings
        </div>
      )}
    </div>
  );
}
