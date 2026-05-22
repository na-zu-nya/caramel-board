import { useEffect, useState } from 'react';

export function useNativeImageDragMode(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const update = (event: KeyboardEvent | MouseEvent | DragEvent) => {
      setEnabled(event.metaKey || event.ctrlKey || event.altKey);
    };
    const disable = () => setEnabled(false);

    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('mousedown', update);
    window.addEventListener('mousemove', update);
    window.addEventListener('dragend', disable);
    window.addEventListener('blur', disable);

    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('mousedown', update);
      window.removeEventListener('mousemove', update);
      window.removeEventListener('dragend', disable);
      window.removeEventListener('blur', disable);
    };
  }, []);

  return enabled;
}
