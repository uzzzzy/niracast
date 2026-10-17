import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, ListMusic, Loader2, Plus, Trash2, Tv } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
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
          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">{t('channels_title')}</h2>
          <p className="mt-1 text-xs text-neutral-400">{t('channels_subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          aria-label={t('create_channel')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-all hover:bg-[#0071E3] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <Plus className="h-4 w-4" />
          <span>{t('create_channel')}</span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[250px] items-center justify-center text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#0A84FF]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-400">
          <p className="text-sm">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            {t('retry')}
          </button>
        </div>
      ) : (channels?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-12 text-center">
          <Tv className="mx-auto h-12 w-12 text-neutral-600 mb-3" />
          <h3 className="text-base font-semibold text-[#F5F5F7]">{t('no_channels')}</h3>
          <p className="mt-1 text-xs text-neutral-400 max-w-sm mx-auto">{t('no_channels_desc')}</p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0071E3]"
          >
            <Plus className="h-4 w-4" />
            <span>{t('create_channel')}</span>
          </button>
        </div>
      ) : (
        <div className="overflow-hidden md:rounded-2xl md:border md:border-white/10 md:bg-[#16161B] md:shadow-lg">
          <div className="w-full">
            <table className="w-full text-left text-sm text-[#F5F5F7] block md:table">
              <thead className="hidden md:table-header-group border-b border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5 w-24">
                    {t('channel_number')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('channel_name')}
                  </th>
                  <th scope="col" className="px-6 py-3.5 hidden md:table-cell">
                    {t('created_at')}
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 block md:table-row-group space-y-3 md:space-y-0">
                <AnimatePresence>
                  {channels?.map((channel) => (
                    <motion.tr
                      key={channel.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: DURATION.normal, ease: EASE.spring }}
                      className="block md:table-row rounded-2xl border border-white/10 bg-[#16161B] md:border-0 md:bg-transparent p-4 md:p-0 shadow-sm md:shadow-none hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 font-mono font-bold text-neutral-300">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-xs text-[#0A84FF] md:bg-transparent md:text-neutral-300 md:h-auto md:w-auto">
                          #{channel.number}
                        </span>
                      </td>
                      <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold md:font-medium">
                            {channel.name}
                          </span>
                        </div>
                      </td>
                      <td className="block md:table-cell px-0 py-1 md:px-6 md:py-4 text-xs text-neutral-400">
                        <span className="md:hidden text-neutral-500 font-mono text-[11px]">
                          {t('created_at')}:{' '}
                        </span>
                        {channel.created_at
                          ? new Date(channel.created_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="block md:table-cell px-0 pt-3 pb-1 md:px-6 md:py-4 text-right border-t border-white/5 md:border-t-0 mt-2 md:mt-0">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap sm:flex-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/channels/${channel.id}`)}
                            aria-label={t('manage_playlist')}
                            className="flex flex-1 sm:flex-initial min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-[#0A84FF]/20 hover:text-[#0A84FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                          >
                            <ListMusic className="h-4 w-4" />
                            <span>{t('manage_playlist')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(channel)}
                            aria-label={t('edit_channel')}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenDelete(channel)}
                            aria-label={t('delete_channel')}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-neutral-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
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
