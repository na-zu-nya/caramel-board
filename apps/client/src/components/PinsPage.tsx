import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import * as LucideIcons from 'lucide-react';
import { Grip, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDatasets } from '@/hooks/useDatasets';
import { isScratchCollection, useScratch } from '@/hooks/useScratch';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { currentDatasetAtom, sidebarOpenAtom } from '@/stores/ui';
import type { AvailableIcon, Collection, MediaType, Pin, PinType } from '@/types';
import { AVAILABLE_ICONS } from '@/types';

interface DragItem {
  id: number;
  index: number;
}

const MEDIA_TYPE_ICON_MAP: Record<MediaType, AvailableIcon> = {
  image: 'Image',
  comic: 'BookOpen',
  video: 'Film',
};

const FIXED_TYPE_ICONS: Record<'SCRATCH' | 'OVERVIEW' | 'FAVORITES' | 'LIKES', AvailableIcon> = {
  SCRATCH: 'NotebookText',
  OVERVIEW: 'Home',
  FAVORITES: 'Star',
  LIKES: 'Heart',
};

const capitalizeLabel = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

export default function PinsPage() {
  const params = useParams({ strict: false });
  const [currentDataset] = useAtom(currentDatasetAtom);
  const datasetId = (params as { datasetId?: string }).datasetId || currentDataset || '1';
  const [sidebarOpen] = useAtom(sidebarOpenAtom);
  const { data: datasets = [] } = useDatasets();

  // const selectedDataset = datasets.find((d) => String(d.id) === String(datasetId))

  // Fetch navigation pins from API
  const { data: apiPins = [], isLoading } = useQuery({
    queryKey: ['navigation-pins', datasetId],
    queryFn: () => apiClient.getNavigationPinsByDataset(datasetId),
  });

  // Filter pins for current dataset (use API data instead of local state)
  const currentDatasetPins = apiPins
    .filter((pin) => String(pin.dataSetId) === String(datasetId))
    .sort((a, b) => a.order - b.order);

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingPin, setEditingPin] = useState<Pin | null>(null);
  const [selectedType, setSelectedType] = useState<
    'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW' | 'FAVORITES' | 'LIKES' | 'SCRATCH'
  >('MEDIA_TYPE');
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>('image');
  const [selectedIcon, setSelectedIcon] = useState<AvailableIcon>('Image');
  const [collections, setCollections] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(false);

  // Edit dialog states
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<AvailableIcon>('Image');

  // Drag state
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { ensureScratch } = useScratch(datasetId);

  // Load collections when dialog opens
  const loadCollections = async () => {
    setLoadingCollections(true);
    try {
      const response = await apiClient.getCollections({
        dataSetId: Number.parseInt(datasetId),
        limit: 100,
      });
      const availableCollections = response.collections
        .filter((collection: Collection) => !isScratchCollection(collection))
        .map((collection: Collection) => ({ id: collection.id, name: collection.name }));
      setCollections(availableCollections);

      const currentSelectionValid = availableCollections.some(
        (collection) => collection.id === selectedCollectionId
      );
      if (!currentSelectionValid) {
        setSelectedCollectionId(
          availableCollections.length > 0 ? availableCollections[0].id : null
        );
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    } finally {
      setLoadingCollections(false);
    }
  };

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string, size = 24) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (IconComponent) {
      return <IconComponent size={size} />;
    }
    return <LucideIcons.Bookmark size={size} />;
  };

  const formatPinDisplayName = (pin: Pin) => {
    if (pin.type === 'MEDIA_TYPE' && pin.mediaType) {
      return capitalizeLabel(pin.mediaType);
    }
    return pin.name;
  };

  const renderFixedTypePreview = (iconName: AvailableIcon, title: string, description: string) => (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="default"
          tabIndex={-1}
          className="col-span-3 h-auto py-3 flex flex-col items-center gap-1 pointer-events-none"
        >
          {renderIcon(iconName, 24)}
          <span className="text-xs">{title}</span>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground text-center">{description}</p>
    </div>
  );

  const isScratchPin = (pin: Pin) =>
    pin.type === 'COLLECTION' &&
    ((pin.collection && isScratchCollection(pin.collection)) || pin.name === 'Scratch');

  const resolveFixedIconForPin = (pin: Pin): AvailableIcon | null => {
    if (pin.type === 'MEDIA_TYPE' && pin.mediaType) {
      return MEDIA_TYPE_ICON_MAP[pin.mediaType as MediaType];
    }
    if (pin.type === 'OVERVIEW') {
      return FIXED_TYPE_ICONS.OVERVIEW;
    }
    if (pin.type === 'FAVORITES') {
      return FIXED_TYPE_ICONS.FAVORITES;
    }
    if (pin.type === 'LIKES') {
      return FIXED_TYPE_ICONS.LIKES;
    }
    if (isScratchPin(pin)) {
      return FIXED_TYPE_ICONS.SCRATCH;
    }
    return null;
  };

  // Create mutations for navigation pins
  const queryClient = useQueryClient();

  const createNavigationPinMutation = useMutation({
    mutationFn: async (newPin: Omit<Pin, 'id' | 'createdAt' | 'updatedAt'>) => {
      console.log('Creating navigation pin via API:', newPin);
      return apiClient.createNavigationPin({
        ...newPin,
        dataSetId: Number.parseInt(datasetId),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigation-pins', datasetId] });
      setShowAddDialog(false);
    },
  });

  const deleteNavigationPinMutation = useMutation({
    mutationFn: async (pinId: number) => {
      console.log('Deleting navigation pin via API:', pinId);
      return apiClient.deleteNavigationPin(pinId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigation-pins', datasetId] });
    },
  });

  const updateNavigationPinMutation = useMutation({
    mutationFn: async ({
      pinId,
      data,
    }: {
      pinId: number;
      data: { name: string; icon: string };
    }) => {
      console.log('Updating navigation pin via API:', pinId, data);
      return apiClient.updateNavigationPin(pinId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigation-pins', datasetId] });
      setShowEditDialog(false);
      setEditingPin(null);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (pins: Array<{ id: number; order: number }>) => {
      console.log('Updating navigation pin order via API:', pins);
      return apiClient.updateNavigationPinOrder(pins);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['navigation-pins', datasetId] });
    },
  });

  // Add new pin
  const handleAddPin = () => {
    if (selectedType === 'MEDIA_TYPE') {
      const newPin = {
        type: 'MEDIA_TYPE' as PinType,
        dataSetId: Number.parseInt(datasetId),
        name: capitalizeLabel(selectedMediaType),
        icon: MEDIA_TYPE_ICON_MAP[selectedMediaType],
        order: currentDatasetPins.length,
        mediaType: selectedMediaType,
      };
      createNavigationPinMutation.mutate(newPin);
    } else if (selectedType === 'COLLECTION' && selectedCollectionId) {
      const selectedCollection = collections.find((c) => c.id === selectedCollectionId);
      if (selectedCollection) {
        const newPin = {
          type: 'COLLECTION' as PinType,
          dataSetId: Number.parseInt(datasetId),
          name: selectedCollection.name,
          icon: selectedIcon,
          order: currentDatasetPins.length,
          collectionId: selectedCollectionId,
        };
        createNavigationPinMutation.mutate(newPin);
      }
    } else if (selectedType === 'OVERVIEW') {
      const newPin = {
        type: 'OVERVIEW' as PinType,
        dataSetId: Number.parseInt(datasetId),
        name: 'Overview',
        icon: FIXED_TYPE_ICONS.OVERVIEW,
        order: currentDatasetPins.length,
      };
      createNavigationPinMutation.mutate(newPin);
    } else if (selectedType === 'FAVORITES') {
      const newPin = {
        type: 'FAVORITES' as PinType,
        dataSetId: Number.parseInt(datasetId),
        name: 'Favorites',
        icon: FIXED_TYPE_ICONS.FAVORITES,
        order: currentDatasetPins.length,
      };
      createNavigationPinMutation.mutate(newPin);
    } else if (selectedType === 'LIKES') {
      const newPin = {
        type: 'LIKES' as PinType,
        dataSetId: Number.parseInt(datasetId),
        name: 'Likes',
        icon: FIXED_TYPE_ICONS.LIKES,
        order: currentDatasetPins.length,
      };
      createNavigationPinMutation.mutate(newPin);
    } else if (selectedType === 'SCRATCH') {
      // Map Scratch to COLLECTION pin with the scratch collectionId
      void (async () => {
        const sc = await ensureScratch();
        const newPin = {
          type: 'COLLECTION' as PinType,
          dataSetId: Number.parseInt(datasetId),
          name: 'Scratch',
          icon: FIXED_TYPE_ICONS.SCRATCH,
          order: currentDatasetPins.length,
          collectionId: sc.id,
        };
        createNavigationPinMutation.mutate(newPin);
      })();
    }
  };

  // Delete pin
  const handleDeletePin = (pinId: number) => {
    deleteNavigationPinMutation.mutate(pinId);
  };

  // Edit pin
  const handleEditPin = (pin: Pin) => {
    setEditingPin(pin);
    setEditName(formatPinDisplayName(pin));
    const fixedIcon = resolveFixedIconForPin(pin);
    setEditIcon((fixedIcon ?? pin.icon) as AvailableIcon);
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editingPin || !editName.trim()) return;

    const fixedIcon = resolveFixedIconForPin(editingPin);

    updateNavigationPinMutation.mutate({
      pinId: editingPin.id,
      data: {
        name: editName.trim(),
        icon: (fixedIcon ?? editIcon) as string,
      },
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, pin: Pin, index: number) => {
    setDraggedItem({ id: pin.id, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedItem || draggedItem.index === dropIndex) {
      setDraggedItem(null);
      return;
    }

    const draggedPin = currentDatasetPins[draggedItem.index];
    const reorderedDatasetPins = [...currentDatasetPins];

    // Remove dragged item
    reorderedDatasetPins.splice(draggedItem.index, 1);
    // Insert at new position
    reorderedDatasetPins.splice(dropIndex, 0, draggedPin);

    // Update order values and send to API
    const updatedOrderPins = reorderedDatasetPins.map((pin, index) => ({
      id: pin.id,
      order: index,
    }));

    updateOrderMutation.mutate(updatedOrderPins);
    setDraggedItem(null);
  };

  const canEditIcon = editingPin
    ? editingPin.type === 'COLLECTION' && !isScratchPin(editingPin)
    : false;
  const editIconPreview = editingPin ? (resolveFixedIconForPin(editingPin) ?? editIcon) : editIcon;

  return (
    <div
      className={cn(
        'fixed top-0 bottom-0 overflow-auto transition-all duration-300 ease-in-out pt-14 bg-background',
        sidebarOpen ? 'left-80' : 'left-0',
        'right-0'
      )}
    >
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-card rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Pin Management</h1>
            <Button
              onClick={() => {
                setShowAddDialog(true);
                if (selectedType === 'COLLECTION') {
                  loadCollections();
                }
              }}
              className=""
            >
              <Plus size={16} className="mr-2" />
              Add Pin
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Loading pins...</p>
            </div>
          ) : currentDatasetPins.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No pinned items</p>
              <p className="text-sm mt-2">Click the button above to add pins</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentDatasetPins.map((pin, index) => (
                <div
                  key={pin.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, pin, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={cn(
                    'flex items-center gap-3 p-4 bg-muted/50 border rounded-lg cursor-move transition-all',
                    dragOverIndex === index && 'ring-2 ring-primary',
                    draggedItem?.id === pin.id && 'opacity-50'
                  )}
                >
                  <Grip size={20} className="text-muted-foreground" />

                  <div className="p-2 bg-muted rounded">{renderIcon(pin.icon, 20)}</div>

                  <div className="flex-1">
                    <div className="font-medium">{formatPinDisplayName(pin)}</div>
                    <div className="text-muted-foreground text-sm">
                      {pin.type === 'COLLECTION'
                        ? (pin.collection && isScratchCollection(pin.collection)) ||
                          pin.name === 'Scratch'
                          ? 'Scratch'
                          : 'Collection'
                        : pin.type === 'MEDIA_TYPE'
                          ? 'Media Type'
                          : pin.type === 'OVERVIEW'
                            ? 'Overview'
                            : pin.type === 'FAVORITES'
                              ? 'Favorites'
                              : 'Likes'}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleEditPin(pin)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleDeletePin(pin.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Pin Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Pin</DialogTitle>
            <DialogDescription>
              Select an item to display in the header navigation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={selectedType === 'MEDIA_TYPE' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedType('MEDIA_TYPE');
                    setSelectedIcon(MEDIA_TYPE_ICON_MAP[selectedMediaType]);
                  }}
                  className=""
                >
                  Media Type
                </Button>
                <Button
                  type="button"
                  variant={selectedType === 'COLLECTION' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedType('COLLECTION');
                    loadCollections();
                  }}
                  className=""
                >
                  Collection
                </Button>
                <Button
                  type="button"
                  variant={selectedType === 'SCRATCH' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedType('SCRATCH');
                    setSelectedIcon(FIXED_TYPE_ICONS.SCRATCH);
                  }}
                  className=""
                >
                  Scratch
                </Button>
                <Button
                  type="button"
                  variant={selectedType === 'OVERVIEW' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedType('OVERVIEW');
                    setSelectedIcon(FIXED_TYPE_ICONS.OVERVIEW);
                  }}
                  className=""
                >
                  Overview
                </Button>
                <Button
                  type="button"
                  variant={selectedType === 'FAVORITES' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedType('FAVORITES');
                    setSelectedIcon(FIXED_TYPE_ICONS.FAVORITES);
                  }}
                  className=""
                >
                  Favorites
                </Button>
                <Button
                  type="button"
                  variant={selectedType === 'LIKES' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedType('LIKES');
                    setSelectedIcon(FIXED_TYPE_ICONS.LIKES);
                  }}
                  className=""
                >
                  Likes
                </Button>
              </div>
            </div>

            {selectedType === 'MEDIA_TYPE' ? (
              <div className="space-y-2">
                <Label>Media Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['image', 'comic', 'video'] as MediaType[]).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={selectedMediaType === type ? 'default' : 'outline'}
                      onClick={() => {
                        setSelectedMediaType(type);
                        setSelectedIcon(MEDIA_TYPE_ICON_MAP[type]);
                      }}
                      className="h-auto py-3 flex flex-col gap-1"
                    >
                      {renderIcon(MEDIA_TYPE_ICON_MAP[type], 24)}
                      <span className="text-xs">
                        {type === 'image' ? 'Images' : type === 'comic' ? 'Comics' : 'Videos'}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : selectedType === 'COLLECTION' ? (
              <div className="space-y-2">
                <Label>Collection</Label>
                {loadingCollections ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : collections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No collections available</p>
                ) : (
                  <Combobox
                    value={selectedCollectionId?.toString()}
                    onValueChange={(value) => setSelectedCollectionId(Number(value))}
                    placeholder="Select a collection..."
                    searchPlaceholder="Search collections..."
                    emptyMessage="No collections found."
                    options={collections.map((collection) => ({
                      value: collection.id.toString(),
                      label: collection.name,
                    }))}
                  />
                )}
              </div>
            ) : selectedType === 'SCRATCH' ? (
              renderFixedTypePreview(
                FIXED_TYPE_ICONS.SCRATCH,
                'Scratch',
                'Pin the Scratch list for quick access'
              )
            ) : selectedType === 'OVERVIEW' ? (
              renderFixedTypePreview(
                FIXED_TYPE_ICONS.OVERVIEW,
                'Overview Page',
                'Pin the dataset overview page for quick access'
              )
            ) : selectedType === 'FAVORITES' ? (
              renderFixedTypePreview(
                FIXED_TYPE_ICONS.FAVORITES,
                'Favorites',
                'Pin your favorites list for quick access'
              )
            ) : selectedType === 'LIKES' ? (
              renderFixedTypePreview(
                FIXED_TYPE_ICONS.LIKES,
                'Likes',
                'Pin your likes activity page for quick access'
              )
            ) : null}

            {selectedType === 'COLLECTION' && (
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {AVAILABLE_ICONS.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setSelectedIcon(iconName)}
                      className={cn(
                        'flex items-center justify-center p-2 rounded-md border transition-colors',
                        selectedIcon === iconName
                          ? 'border-primary bg-primary/10'
                          : 'border-input hover:bg-accent hover:text-accent-foreground'
                      )}
                      title={iconName}
                    >
                      {renderIcon(iconName, 16)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddPin}
              disabled={
                (selectedType === 'COLLECTION' && !selectedCollectionId) ||
                createNavigationPinMutation.isPending
              }
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Pin Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pin</DialogTitle>
            <DialogDescription>Update the name and icon for this pin</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter pin name"
                required
              />
            </div>

            {canEditIcon ? (
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {AVAILABLE_ICONS.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setEditIcon(iconName)}
                      className={cn(
                        'flex items-center justify-center p-2 rounded-md border transition-colors',
                        editIcon === iconName
                          ? 'border-primary bg-primary/10'
                          : 'border-input hover:bg-accent hover:text-accent-foreground'
                      )}
                      title={iconName}
                    >
                      {renderIcon(iconName, 16)}
                    </button>
                  ))}
                </div>
              </div>
            ) : editingPin ? (
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/50 p-3">
                  <div className="rounded bg-background p-2">{renderIcon(editIconPreview, 20)}</div>
                  <span className="text-sm text-muted-foreground">
                    Icon is fixed for this pin type.
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={updateNavigationPinMutation.isPending || !editName.trim()}
            >
              {updateNavigationPinMutation.isPending ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
