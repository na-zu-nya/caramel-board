import { hexToOklch } from '@/lib/utils';
import { useEffect } from 'react';

export function useThemeColor(themeColor?: string) {
  useEffect(() => {
    if (!themeColor) {
      // Reset to default colors if no theme color
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-foreground');
      document.documentElement.style.removeProperty('--color-primary');
      document.documentElement.style.removeProperty('--color-primary-foreground');
      return;
    }

    try {
      // Normalize to OKLCH string
      // - Accepts hex like "#3b82f6" or CSS oklch() string
      const isOklch = /^oklch\s*\(/i.test(themeColor);
      const oklch = isOklch ? themeColor : hexToOklch(themeColor);

      // Set CSS variables for primary color
      document.documentElement.style.setProperty('--primary', oklch);
      document.documentElement.style.setProperty('--color-primary', oklch);

      // Pick readable foreground based on lightness (L of OKLCH)
      // oklch(L C H) where L is 0..1
      const lMatch = oklch.match(/oklch\s*\(\s*([0-9]*\.?[0-9]+)/i);
      const L = lMatch ? parseFloat(lMatch[1]) : 0.5;
      // Threshold: if background is very light, use near-black, otherwise white
      // 0.7 chosen empirically for good contrast across saturated colors
      const foreground = L >= 0.7 ? 'oklch(0.141 0.005 285.823)' : 'oklch(0.985 0 0)';
      document.documentElement.style.setProperty('--primary-foreground', foreground);
      document.documentElement.style.setProperty('--color-primary-foreground', foreground);

      // Also update related colors
      document.documentElement.style.setProperty('--ring', oklch);
      document.documentElement.style.setProperty('--color-ring', oklch);
      document.documentElement.style.setProperty('--sidebar-primary', oklch);
      document.documentElement.style.setProperty('--color-sidebar-primary', oklch);

      console.log('Theme color set:', { input: themeColor, oklch, L, foreground });
    } catch (error) {
      console.error('Failed to set theme color:', error);
    }
  }, [themeColor]);
}
