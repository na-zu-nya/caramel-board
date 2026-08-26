import { Lock, LockOpen } from 'lucide-react';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';

interface ViewerInteractionLockButtonProps {
  locked: boolean;
  disabled?: boolean;
  lockLabel: string;
  unlockLabel: string;
  onToggle: () => void;
}

export default function ViewerInteractionLockButton({
  locked,
  disabled = false,
  lockLabel,
  unlockLabel,
  onToggle,
}: ViewerInteractionLockButtonProps) {
  const label = locked ? unlockLabel : lockLabel;

  return (
    <HeaderIconButton
      onClick={onToggle}
      isActive={locked}
      disabled={disabled}
      aria-label={label}
      aria-pressed={locked}
      title={label}
    >
      {locked ? <Lock size={18} /> : <LockOpen size={18} />}
    </HeaderIconButton>
  );
}
