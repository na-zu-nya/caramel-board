import type { MediaGridItem } from '@/types';

interface DebugOverlayProps {
  anchorItemId?: string | number | null;
  visibleItems: MediaGridItem[];
  anchorDebugInfo: {
    anchorInVisible: boolean;
    anchorFound: boolean;
  };
}

export function DebugOverlay({ anchorItemId, visibleItems, anchorDebugInfo }: DebugOverlayProps) {
  return (
    <>
      {/* Current anchor info */}
      {anchorItemId ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '8px',
            fontSize: '12px',
          }}
        >
          Current Anchor: {anchorItemId}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 50,
            background: 'rgba(255,0,0,0.8)',
            color: 'white',
            padding: '8px',
            fontSize: '12px',
          }}
        >
          No Anchor Set
        </div>
      )}

      {/* Visible items info */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 0,
          zIndex: 50,
          background: 'rgba(0,0,255,0.8)',
          color: 'white',
          padding: '8px',
          fontSize: '12px',
        }}
      >
        Visible Items: {visibleItems.length}, IDs:{' '}
        {visibleItems
          .slice(0, 3)
          .map((item) => item.id)
          .join(', ')}
        ...
        {anchorItemId && <br />}
        Anchor in visible:{' '}
        {anchorItemId
          ? anchorDebugInfo.anchorInVisible
            ? 'YES'
            : anchorDebugInfo.anchorFound
              ? 'ADDED'
              : 'NO'
          : 'N/A'}
      </div>
    </>
  );
}
