import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, type ChannelStatus } from '../../../lib/api';

export type SSEConnectionState = 'connected' | 'connecting';

interface AdminEventsContextType {
  statuses: Record<number, ChannelStatus>;
  connectionState: SSEConnectionState;
  refreshChannel: (channelId: number) => Promise<void>;
  updateChannelLocal: (channelId: number, status: Partial<ChannelStatus>) => void;
}

const AdminEventsContext = createContext<AdminEventsContextType>({
  statuses: {},
  connectionState: 'connecting',
  refreshChannel: async () => {},
  updateChannelLocal: () => {},
});

export function AdminEventsProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Record<number, ChannelStatus>>({});
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('connecting');

  const refreshChannel = useCallback(async (channelId: number) => {
    try {
      const status = await api.getChannelStatus(channelId);
      setStatuses((prev) => ({
        ...prev,
        [channelId]: status,
      }));
    } catch {
      // Ignore background refresh errors
    }
  }, []);

  const updateChannelLocal = useCallback((channelId: number, partial: Partial<ChannelStatus>) => {
    setStatuses((prev) => {
      const current = prev[channelId] || {
        channel_id: channelId,
        state: 'stopped',
        item: null,
        skip_offset_sec: 0,
      };
      return {
        ...prev,
        [channelId]: { ...current, ...partial },
      };
    });
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/v1/events', { withCredentials: true });
    } catch {
      setConnectionState('connecting');
      return;
    }

    es.onopen = () => {
      setConnectionState('connected');
    };

    es.onerror = () => {
      setConnectionState('connecting');
    };

    const handleSnapshot = (event: MessageEvent) => {
      try {
        const runningList: ChannelStatus[] = JSON.parse(event.data);
        const map: Record<number, ChannelStatus> = {};
        for (const item of runningList) {
          map[item.channel_id] = item;
        }
        setStatuses((prev) => ({
          ...prev,
          ...map,
        }));
      } catch {
        // Non-JSON or malformed snapshot
      }
    };

    const handlePlaying = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const channelId = payload.channel_id;
        if (channelId) {
          refreshChannel(channelId);
        }
      } catch {
        // Malformed payload
      }
    };

    const handleIdle = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const channelId = payload.channel_id;
        if (channelId) {
          updateChannelLocal(channelId, { state: 'idle', item: null });
        }
      } catch {
        // Malformed payload
      }
    };

    const handleStopped = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const channelId = payload.channel_id;
        if (channelId) {
          updateChannelLocal(channelId, { state: 'stopped', item: null });
        }
      } catch {
        // Malformed payload
      }
    };

    const handleSkipped = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const channelId = payload.channel_id;
        if (channelId) {
          refreshChannel(channelId);
        }
      } catch {
        // Malformed payload
      }
    };

    es.addEventListener('snapshot', handleSnapshot);
    es.addEventListener('channel.playing', handlePlaying);
    es.addEventListener('channel.idle', handleIdle);
    es.addEventListener('channel.stopped', handleStopped);
    es.addEventListener('channel.skipped', handleSkipped);

    return () => {
      if (es) {
        es.removeEventListener('snapshot', handleSnapshot);
        es.removeEventListener('channel.playing', handlePlaying);
        es.removeEventListener('channel.idle', handleIdle);
        es.removeEventListener('channel.stopped', handleStopped);
        es.removeEventListener('channel.skipped', handleSkipped);
        es.close();
      }
    };
  }, [refreshChannel, updateChannelLocal]);

  return (
    <AdminEventsContext.Provider
      value={{
        statuses,
        connectionState,
        refreshChannel,
        updateChannelLocal,
      }}
    >
      {children}
    </AdminEventsContext.Provider>
  );
}

export function useAdminEvents(): AdminEventsContextType {
  return useContext(AdminEventsContext);
}
