import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, ListMusic, Loader2, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import emptyChannels from '../../../assets/empty-channels.webp';
import { Button, Card, EmptyState } from '../../../components/ui';
import { api, type Channel } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { DURATION, EASE } from '../../../lib/motion/tokens';
import { ChannelModal } from '../components/ChannelModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';

export function ChannelsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);

  const {
    data: channels,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: api.getChannels,
  });

  // Create Channel Mutation with Optimistic Update
  const createMutation = useMutation({
    mutationFn: (data: { number: number; name: string }) => api.createChannel(data),
    onMutate: async (newChan) => {
      await queryClient.cancelQueries({ queryKey: ['admin-channels'] });
      const previousChannels = queryClient.getQueryData<Channel[]>(['admin-channels']);
      if (previousChannels) {
        const optimistic: Channel = {
          id: Date.now(),
          number: newChan.number,
          name: newChan.name,
          created_at: new Date().toISOString(),
        };
        queryClient.setQueryData<Channel[]>(['admin-channels'], [...previousChannels, optimistic]);
      }
      return { previousChannels };
    },
    onError: (_err, _newChan, context) => {
      if (context?.previousChannels) {
        queryClient.setQueryData(['admin-channels'], context.previousChannels);
      }
    },
    onSuccess: () => {
      toast.success(t('channel_created'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
  });

  // Edit Channel Mutation with Optimistic Update
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { number: number; name: string } }) =>
      api.updateChannel(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-channels'] });
      const previousChannels = queryClient.getQueryData<Channel[]>(['admin-channels']);
      if (previousChannels) {
        queryClient.setQueryData<Channel[]>(
          ['admin-channels'],
          previousChannels.map((c) => (c.id === id ? { ...c, ...data } : c)),
        );
      }
      return { previousChannels };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousChannels) {
        queryClient.setQueryData(['admin-channels'], context.previousChannels);
      }
    },
    onSuccess: () => {
      toast.success(t('channel_updated'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
  });

  // Delete Channel Mutation with Optimistic Update
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteChannel(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin-channels'] });
      const previousChannels = queryClient.getQueryData<Channel[]>(['admin-channels']);
      if (previousChannels) {
        queryClient.setQueryData<Channel[]>(
          ['admin-channels'],
          previousChannels.filter((c) => c.id !== id),
        );
      }
      return { previousChannels };
    },
    onError: (_err, _id, context) => {
      if (context?.previousChannels) {
        queryClient.setQueryData(['admin-channels'], context.previousChannels);
      }
      toast.error(t('channel_delete_failed'));
    },
    onSuccess: () => {
      toast.success(t('channel_deleted'));
      setIsDeleteOpen(false);
      setChannelToDelete(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
  });

  const handleOpenCreate = () => {
    setChannelToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (channel: Channel) => {
    setChannelToEdit(channel);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (channel: Channel) => {
    setChannelToDelete(channel);
    setIsDeleteOpen(true);
  };

  const handleModalSubmit = async (data: { number: number; name: string }) => {
    if (channelToEdit) {
      await updateMutation.mutateAsync({ id: channelToEdit.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleConfirmDelete = async () => {
    if (!channelToDelete) return;
    await deleteMutation.mutateAsync(channelToDelete.id);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="title text-xl font-bold tracking-tight text-fg">{t('channels_title')}</h2>
          <p className="mt-1 text-xs text-fg-muted">{t('channels_subtitle')}</p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} aria-label={t('create_channel')}>
          <Plus className="h-4 w-4 mr-1.5" />
          <span>{t('create_channel')}</span>
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[250px] items-center justify-center text-fg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : error ? (
        <div className="rounded-tile border border-danger/30 bg-danger/10 p-6 text-center text-danger">
          <p className="text-sm">{error.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            className="mt-3"
          >
            {t('retry')}
          </Button>
        </div>
      ) : (channels?.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState
            art={emptyChannels}
            title={t('no_channels')}
            description={t('no_channels_desc')}
            action={
              <Button variant="primary" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                <span>{t('create_channel')}</span>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="w-full">
            <table className="w-full text-left text-sm text-fg block md:table">
              <thead className="hidden md:table-header-group border-b border-hairline bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3 w-28">
                    {t('channel_number')}
                  </th>
                  <th scope="col" className="px-5 py-3">
                    {t('channel_name')}
                  </th>
                  <th scope="col" className="px-5 py-3 hidden md:table-cell">
                    {t('created_at')}
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline block md:table-row-group">
                <AnimatePresence>
                  {channels?.map((channel) => (
                    <motion.tr
                      key={channel.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: DURATION.normal, ease: EASE.spring }}
                      className="block md:table-row rounded-tile hover:bg-surface-3/50 transition-colors p-4 md:p-0 my-1 md:my-0"
                    >
                      <td className="block md:table-cell px-0 py-1 md:px-5 md:py-3.5">
                        <span className="timecode font-bold text-xs px-2.5 py-1 rounded-control bg-surface-2 border border-hairline text-accent inline-block">
                          #{channel.number}
                        </span>
                      </td>
                      <td className="block md:table-cell px-0 py-1 md:px-5 md:py-3.5 font-medium text-fg">
                        <span className="text-sm font-semibold md:font-medium">{channel.name}</span>
                      </td>
                      <td className="block md:table-cell px-0 py-1 md:px-5 md:py-3.5 text-xs text-fg-muted">
                        <span className="md:hidden text-fg-subtle font-sans text-[11px] mr-1">
                          {t('created_at')}:{' '}
                        </span>
                        <span className="timecode">
                          {channel.created_at
                            ? new Date(channel.created_at).toLocaleDateString()
                            : '-'}
                        </span>
                      </td>
                      <td className="block md:table-cell px-0 pt-3 pb-1 md:px-5 md:py-3.5 text-right border-t border-hairline md:border-t-0 mt-2 md:mt-0">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap sm:flex-nowrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(`/admin/channels/${channel.id}`)}
                            aria-label={t('manage_playlist')}
                            className="flex-1 sm:flex-initial"
                          >
                            <ListMusic className="h-4 w-4 mr-1.5" />
                            <span>{t('manage_playlist')}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(channel)}
                            aria-label={t('edit_channel')}
                            className="px-2"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDelete(channel)}
                            aria-label={t('delete_channel')}
                            className="px-2 hover:text-danger hover:bg-danger/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create / Edit Channel Modal */}
      <ChannelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        channelToEdit={channelToEdit}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setChannelToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        channel={channelToDelete}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
