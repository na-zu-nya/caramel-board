import { Button } from '@/components/ui/button';
import { LibraryCard, type ColorStats, PRESET_COLOR_GROUPS, DEFAULT_CARAMEL_COLOR } from '@/components/ui/LibraryCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Dialog as UIDialog,
  DialogContent as UIDialogContent,
  DialogHeader as UIDialogHeader,
  DialogTitle as UIDialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { useCreateDataset, useDatasets, useDeleteDataset, useUpdateDataset } from '@/hooks/useDatasets';
import { useFirstLibraryBootstrap } from '@/hooks/useFirstLibraryBootstrap';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { sidebarOpenAtom } from '@/stores/ui';
import type { Dataset } from '@/types';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Loader2, Palette, Plus, RefreshCw, Wand2, X, Check } from 'lucide-react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/settings/libraries')({
  component: DatasetManagement,
});

function DatasetManagement() {
  const { data: datasets = [], isLoading } = useDatasets();
  const createDataset = useCreateDataset();
  const updateDataset = useUpdateDataset();
  const deleteDataset = useDeleteDataset();
  const bootstrapFirstLibrary = useFirstLibraryBootstrap();
  const [_sidebarOpen] = useAtom(sidebarOpenAtom);
  const queryClient = useQueryClient();

  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: false,
      showFilter: false,
      showSelection: false,
    }),
    []
  );

  useHeaderActions(headerActionsConfig);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [updatingColors, setUpdatingColors] = useState<Record<string, boolean>>({});
  const [updatingAutoTags, setUpdatingAutoTags] = useState<Record<string, boolean>>({});

  const [embeddingDialogOpen, setEmbeddingDialogOpen] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [regenerateMode, setRegenerateMode] = useState<'incremental' | 'force'>('incremental');
  const [protectionDialog, setProtectionDialog] = useState<{ open: boolean; mode: 'enable' | 'disable'; datasetId: string | null }>({
    open: false,
    mode: 'enable',
    datasetId: null,
  });
  const [protectionPassword, setProtectionPassword] = useState('');
  const [defaultSettingId, setDefaultSettingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📂');
  const [newColor, setNewColor] = useState(DEFAULT_CARAMEL_COLOR);
  const [createColorOpen, setCreateColorOpen] = useState(false);
  const [createEmojiOpen, setCreateEmojiOpen] = useState(false);

  const colorStatsQueries = useQueries({
    queries: datasets.map((dataset) => ({
      queryKey: ['colorStats', dataset.id],
      queryFn: () => apiClient.getColorStats(dataset.id),
      enabled: !!dataset.id,
    })),
  });

  const { data: itemCounts } = useQuery({
    queryKey: ['library-item-counts', datasets.map((d) => d.id)],
    enabled: datasets.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        datasets.map(async (d) => {
          try {
            const res = await apiClient.getStacks({ datasetId: d.id, limit: 1, offset: 0 });
            return [d.id, res.total as number] as const;
          } catch {
            return [d.id, d.itemCount ?? 0] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    staleTime: 5000,
  });

  const handleUpdateLibrary = (
    id: string,
    updates: { name?: string; icon?: string; themeColor?: string }
  ) => {
    updateDataset.mutate(
      { id, ...updates },
      {
        onError: (error) => {
          console.error('Failed to update library:', error);
          alert('Failed to update library. Please try again.');
        },
      }
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this library?')) {
      return;
    }

    try {
      await deleteDataset.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete library:', error);
      alert('Failed to delete library. It may still contain items.');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const wasEmpty = datasets.length === 0;

    try {
      const created = await createDataset.mutateAsync({
        name: newName,
        icon: newIcon,
        themeColor: newColor,
      });

      if (wasEmpty && created?.id) {
        await bootstrapFirstLibrary(created.id);
      }

      setShowCreateModal(false);
      setNewName('');
      setNewIcon('📂');
      setNewColor(DEFAULT_CARAMEL_COLOR);
    } catch (error) {
      console.error('Failed to create library:', error);
      alert('Failed to create library. The name might already be in use.');
    }
  };

  const handleOpenRefreshDialog = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setRegenerateMode('incremental');
    setEmbeddingDialogOpen(true);
  };

  const runRefreshAllMutation = useMutation({
    mutationFn: async ({
      datasetId,
      forceRegenerate,
    }: { datasetId: string; forceRegenerate: boolean }) =>
      apiClient.runDatasetRefreshAll(datasetId, {
        forceRegenerate,
        batchSize: 20,
      }),
    onSuccess: (result, variables) => {
      setUpdatingColors((prev) => ({ ...prev, [variables.datasetId]: false }));
      setUpdatingAutoTags((prev) => ({ ...prev, [variables.datasetId]: false }));

      alert(
        [
          'Full refresh has started successfully.',
          '',
          `• Thumbnails: ${result.scheduled?.thumbnails ?? 0}`,
          `• Color analysis: ${result.scheduled?.colors ?? 0}`,
          `• Auto-tagging: ${result.scheduled?.autotags ?? 0}`,
          '',
          'Processing continues in the background.',
        ].join('\n')
      );
    },
    onError: (error, variables) => {
      console.error('Failed to start full refresh:', error);
      setUpdatingColors((prev) => ({ ...prev, [variables.datasetId]: false }));
      setUpdatingAutoTags((prev) => ({ ...prev, [variables.datasetId]: false }));
      alert('Failed to start the full refresh.');
    },
  });

  const handleConfirmEmbeddings = async () => {
    if (!selectedDatasetId) return;

    setEmbeddingDialogOpen(false);
    setUpdatingColors((prev) => ({ ...prev, [selectedDatasetId]: true }));
    setUpdatingAutoTags((prev) => ({ ...prev, [selectedDatasetId]: true }));

    try {
      await runRefreshAllMutation.mutateAsync({
        datasetId: selectedDatasetId,
        forceRegenerate: regenerateMode === 'force',
      });
    } catch (error) {
      console.error('Failed to start full refresh:', error);
    }
  };

  const handleSetDefault = async (id: string) => {
    setDefaultSettingId(id);
    try {
      await apiClient.setDefaultDataset(id);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    } catch (error) {
      console.error('Failed to set default library:', error);
      alert('Failed to set the default library.');
    } finally {
      setDefaultSettingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 pt-24 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Library Management</h1>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/30 transition-colors"
          >
            <Plus size={20} />
            <span>Create Library</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {datasets.map((dataset, index) => {
              const colorStats = (colorStatsQueries[index]?.data ?? null) as ColorStats | null;
              const isUpdating = Boolean(updatingAutoTags[dataset.id] || updatingColors[dataset.id]);
              const itemCount = itemCounts?.[dataset.id] ?? dataset.itemCount ?? 0;
              const libraryDataset = {
                ...dataset,
                itemCount,
              } as Dataset & {
                itemCount?: number;
                icon?: string;
                themeColor?: string;
                isDefault?: boolean;
                isProtected?: boolean;
              };

              return (
                <LibraryCard
                  key={dataset.id}
                  dataset={libraryDataset}
                  colorStats={colorStats}
                  isRefreshing={isUpdating}
                  disableSetDefault={defaultSettingId === dataset.id}
                  onUpdate={(updates) => handleUpdateLibrary(dataset.id, updates)}
                  onDelete={() => handleDelete(dataset.id)}
                  onSetDefault={() => handleSetDefault(dataset.id)}
                  onStartRefresh={() => handleOpenRefreshDialog(dataset.id)}
                  onProtectionClick={() => {
                    const currently = Boolean((dataset as any).isProtected);
                    setProtectionDialog({
                      open: true,
                      mode: currently ? 'disable' : 'enable',
                      datasetId: dataset.id,
                    });
                  }}
                />
              );
            })}
          </div>
        )}

        {!isLoading && datasets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No libraries created yet.</p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors"
            >
              <Plus size={20} />
              <span>Create your first library</span>
            </button>
          </div>
        )}

        {showCreateModal && (
          <>
            <div
              className="fixed inset-0 bg-white/80 backdrop-blur-sm z-40"
              onClick={() => setShowCreateModal(false)}
            />

            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border rounded-lg shadow-lg z-50 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Create New Library</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Library Name</label>
                  <div className="flex items-center gap-3">
                    <Popover open={createEmojiOpen} onOpenChange={setCreateEmojiOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-16 h-16 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                          aria-label="Select library icon"
                        >
                          <span className="text-4xl leading-none">{newIcon || '📂'}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="p-0 border bg-white shadow-lg z-50">
                        <EmojiPicker
                          autoFocusSearch={false}
                          lazyLoadEmojis
                          onEmojiClick={(selection: EmojiClickData) => {
                            setNewIcon(selection.emoji);
                            setCreateEmojiOpen(false);
                          }}
                          theme="auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Enter library name"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Theme Color</label>
                  <Popover open={createColorOpen} onOpenChange={setCreateColorOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-full border shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white"
                        style={{ backgroundColor: newColor, borderColor: 'rgba(0,0,0,0.1)' }}
                        aria-label="Change theme color"
                      />
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-4 space-y-3">
                      {PRESET_COLOR_GROUPS.map((group) => (
                        <div key={group.label} className="space-y-2">
                          <div className="text-xs font-medium text-gray-600">{group.label}</div>
                          <div className="grid grid-cols-6 gap-2">
                            {group.colors.map((hex) => {
                              const isSelected = newColor.toLowerCase() === hex.toLowerCase();
                              return (
                                <button
                                  key={hex}
                                  type="button"
                                  onClick={() => { setNewColor(hex); setCreateColorOpen(false); }}
                                  className="relative h-8 w-8 rounded-full border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white"
                                  style={{
                                    backgroundColor: hex,
                                    borderColor: isSelected ? 'rgba(59, 130, 246, 0.9)' : 'transparent',
                                  }}
                                  aria-label={`Use color ${hex}`}
                                  aria-pressed={isSelected}
                                >
                                  {isSelected && (
                                    <span className="absolute inset-0 flex items-center justify-center text-white">
                                      <Check size={14} />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Library
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        <Dialog open={embeddingDialogOpen} onOpenChange={setEmbeddingDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Full Refresh</DialogTitle>
              <DialogDescription>
                Regenerate thumbnails, analyze colors, and rebuild auto-tags in one batch.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <RadioGroup
                value={regenerateMode}
                onValueChange={(value) => setRegenerateMode(value as 'incremental' | 'force')}
              >
                <div className="space-y-3">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="regenerateMode"
                      value="incremental"
                      checked={regenerateMode === 'incremental'}
                      onChange={() => setRegenerateMode('incremental')}
                      className="mt-1"
                    />
                    <div className="space-y-1">
                      <div className="font-medium">Incremental (recommended)</div>
                      <div className="text-sm text-gray-600">
                        Only processes items that have not been analyzed yet.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="regenerateMode"
                      value="force"
                      checked={regenerateMode === 'force'}
                      onChange={() => setRegenerateMode('force')}
                      className="mt-1"
                    />
                    <div className="space-y-1">
                      <div className="font-medium">Force regenerate</div>
                      <div className="text-sm text-gray-600">
                        Rebuilds thumbnails, colors, and tags for all items. This may take time.
                      </div>
                    </div>
                  </label>
                </div>
              </RadioGroup>

              <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium text-blue-900">Included steps</h4>
                <div className="space-y-1 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} />
                    <span>Thumbnails — regenerate the lead asset thumbnail for every stack.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Palette size={14} />
                    <span>Color analysis — extract key colors for better search and filtering.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wand2 size={14} />
                    <span>Auto-tagging — local AI updates descriptive tags.</span>
                  </div>
                </div>
              </div>

              {regenerateMode === 'force' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    <strong>Heads-up:</strong> Force regenerate revisits every item and may take a long time for large libraries.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEmbeddingDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleConfirmEmbeddings}
                style={{
                  background: 'linear-gradient(to right, rgb(147 51 234), rgb(79 70 229))',
                  transition: 'opacity 150ms',
                  WebkitTransform: 'translateZ(0)',
                  transform: 'translateZ(0)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Start Refresh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <UIDialog
          open={protectionDialog.open}
          onOpenChange={(open) => {
            setProtectionDialog((p) => ({ ...p, open }));
            if (!open) setProtectionPassword('');
          }}
        >
          <UIDialogContent className="sm:max-w-sm">
            <UIDialogHeader>
              <UIDialogTitle>
                {protectionDialog.mode === 'enable' ? 'Enable Protection' : 'Disable Protection'}
              </UIDialogTitle>
            </UIDialogHeader>
            <div className="space-y-3">
              <Input
                type="password"
                placeholder={
                  protectionDialog.mode === 'enable' ? 'Set password' : 'Current password'
                }
                value={protectionPassword}
                onChange={(e) => setProtectionPassword(e.target.value)}
              />
              <Button
                onClick={async () => {
                  if (!protectionDialog.datasetId) return;
                  try {
                    if (protectionDialog.mode === 'enable') {
                      await apiClient.setDatasetProtection(protectionDialog.datasetId, {
                        enable: true,
                        password: protectionPassword,
                      });
                    } else {
                      await apiClient.setDatasetProtection(protectionDialog.datasetId, {
                        enable: false,
                        currentPassword: protectionPassword,
                      });
                    }
                    setProtectionPassword('');
                    setProtectionDialog({ open: false, mode: 'enable', datasetId: null });
                    queryClient.invalidateQueries({ queryKey: ['datasets'] });
                  } catch (error) {
                    console.error('Failed to update protection:', error);
                    alert('Failed to update protection settings.');
                  }
                }}
                disabled={!protectionPassword}
              >
                {protectionDialog.mode === 'enable' ? 'Enable' : 'Disable'}
              </Button>
            </div>
          </UIDialogContent>
        </UIDialog>
      </div>
    </div>
  );
}
