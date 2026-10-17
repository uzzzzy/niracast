import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, type ChannelStatus } from '../../../lib/api';

export type SSEConnectionState = 'connected' | 'connecting';

interface AdminEventsContextType {
  statuses: Record<number, ChannelStatus>;
  connectionState: SSEConnectionState;
  totalViewers: number;
  refreshChannel: (channelId: number) => Promise<void>;
  updateChannelLocal: (channelId: number, status: Partial<ChannelStatus>) => void;
}

const AdminEventsContext = createContext<AdminEventsContextType>({
  statuses: {},
  connectionState: 'connecting',
  totalViewers: 0,
  refreshChannel: async () => {},
  updateChannelLocal: () => {},
});

export function AdminEventsProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Record<number, ChannelStatus>>({});
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('connecting');
  const [totalViewers, setTotalViewers] = useState<number>(0);

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
        viewers: 0,
        restarts: 0,
        last_error: '',
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
        let initialTotal = 0;
        for (const item of runningList) {
          map[item.channel_id] = item;
          if (typeof item.viewers === 'number') {
            initialTotal += item.viewers;
          }
        }
        setStatuses((prev) => ({
          ...prev,
          ...map,
        }));
        setTotalViewers((prev) => (prev > 0 ? prev : initialTotal));
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

    const handleViewersUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const channelId = payload.channel_id;
        const viewers =
          typeof payload.data?.viewers === 'number'
            ? payload.data.viewers
            : Number(payload.data?.viewers ?? 0);
        if (channelId === 0) {
          setTotalViewers(viewers);
        } else if (channelId > 0) {
          updateChannelLocal(channelId, { viewers });
        }
      } catch {
        // Malformed payload
      }
    };

    const handleChannelHealth = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const channelId = payload.channel_id;
        if (channelId > 0 && payload.data) {
          const restarts =
            typeof payload.data.restarts === 'number'
              ? payload.data.restarts
              : Number(payload.data.restarts ?? 0);
          const lastError =
            typeof payload.data.last_error === 'string' ? payload.data.last_error : '';
          updateChannelLocal(channelId, {
            restarts,
            last_error: lastError,
          });
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
    es.addEventListener('viewers.update', handleViewersUpdate);
    es.addEventListener('channel.health', handleChannelHealth);

    return () => {
      if (es) {
        es.removeEventListener('snapshot', handleSnapshot);
        es.removeEventListener('channel.playing', handlePlaying);
        es.removeEventListener('channel.idle', handleIdle);
        es.removeEventListener('channel.stopped', handleStopped);
        es.removeEventListener('channel.skipped', handleSkipped);
        es.removeEventListener('viewers.update', handleViewersUpdate);
        es.removeEventListener('channel.health', handleChannelHealth);
        es.close();
      }
    };
  }, [refreshChannel, updateChannelLocal]);

  return (
    <AdminEventsContext.Provider
      value={{
        statuses,
        connectionState,
        totalViewers,
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
