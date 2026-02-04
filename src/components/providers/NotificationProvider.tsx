/**
 * NotificationProvider
 *
 * Context provider that makes notification state and controls accessible
 * throughout the app without prop drilling.
 */

'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { NotificationService, NotificationPermission } from '@/lib/notifications';

interface NotificationContextValue {
  /** Current browser notification permission state */
  permission: NotificationPermission;
  /** Whether notifications are enabled by user preference */
  enabled: boolean;
  /** Request notification permission (call on user action) */
  requestPermission: () => Promise<void>;
  /** Toggle enabled state */
  setEnabled: (enabled: boolean) => void;
  /** Whether the browser supports notifications */
  isSupported: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the app and provides notification context
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [permission, setPermission] = useState<NotificationPermission>(
    NotificationService.getPermission()
  );

  const [enabled, setEnabledState] = useState<boolean>(
    NotificationService.isEnabled()
  );

  const requestPermission = useCallback(async () => {
    const newPermission = await NotificationService.requestPermission();
    setPermission(newPermission);

    // Auto-enable if permission was granted
    if (newPermission === 'granted') {
      NotificationService.setEnabled(true);
      setEnabledState(true);
    }
  }, []);

  const setEnabled = useCallback((newEnabled: boolean) => {
    NotificationService.setEnabled(newEnabled);
    setEnabledState(newEnabled);
  }, []);

  const value: NotificationContextValue = {
    permission,
    enabled,
    requestPermission,
    setEnabled,
    isSupported: NotificationService.isSupported(),
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification context
 * @throws Error if used outside NotificationProvider
 */
export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }

  return context;
}
