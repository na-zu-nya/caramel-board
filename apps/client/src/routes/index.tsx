import { useDatasets } from '@/hooks/useDatasets';
import { apiClient } from '@/lib/api-client';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: DatasetList,
});

function DatasetList() {
  const { data: datasets = [], isLoading } = useDatasets();
  const navigate = useNavigate();

  // Hide header actions on dataset selection page
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: false,
      showFilter: false,
      showSelection: false,
    }),
    []
  );

  useHeaderActions(headerActionsConfig);

  useEffect(() => {
    if (!isLoading && datasets.length === 0) {
      void navigate({ to: '/setup' });
    }
  }, [isLoading, datasets.length, navigate]);

  // Fetch item counts per dataset (fallback when API doesn't include itemCount)
  const { data: countsMap } = useQuery({
    queryKey: ['dataset-counts', datasets.map((d) => d.id)],
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

  if (!isLoading && datasets.length === 0) {
    return null;
  }

  return (
    <div className="transition-all duration-300 ease-in-out">
      <div className="container mx-auto px-4 py-8 pt-24 space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Select a Library</h1>
          <p className="text-muted-foreground text-lg">
            Choose a library to explore your collection
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {datasets.map((dataset) => (
              <Link
                key={dataset.id}
                to="/library/$datasetId"
                params={{ datasetId: dataset.id }}
                className="group relative overflow-hidden rounded-lg border bg-card p-6 text-left transition-all block shadow-[0_6px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.12)]"
                style={
                  {
                    backgroundColor: dataset.themeColor
                      ? `color-mix(in oklch, ${dataset.themeColor} 8%, transparent)`
                      : undefined,
                    borderColor: dataset.themeColor
                      ? `color-mix(in oklch, ${dataset.themeColor} 20%, transparent)`
                      : undefined,
                    '--dataset-color': dataset.themeColor || 'oklch(0.646 0.222 41.116)',
                  } as CSSProperties
                }
              >
                <div
                  className="absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-15"
                  style={{
                    background:
                      'linear-gradient(to bottom right, var(--dataset-color), transparent)',
                  }}
                />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{dataset.icon || '📁'}</span>
                    <h3 className="text-2xl font-semibold">{dataset.name}</h3>
                  </div>
                  <p className="text-muted-foreground">
                    {(countsMap?.[dataset.id] ?? dataset.itemCount ?? 0).toLocaleString()} items
                  </p>
                </div>
                <div className="mt-4 h-1 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: '70%',
                      backgroundColor: dataset.themeColor || 'oklch(0.646 0.222 41.116)',
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
