interface InfoSelectionFrameProps {
  visible: boolean;
}

/**
 * 情報パネルで表示中のアイテムを示す、レイアウトに影響しない内側の枠。
 */
export function InfoSelectionFrame({ visible }: InfoSelectionFrameProps) {
  if (!visible) return null;

  return (
    <span
      aria-hidden="true"
      data-info-selection-frame="true"
      className="pointer-events-none absolute inset-0 z-30 box-border rounded-[inherit] border-[3px] border-primary"
    />
  );
}
