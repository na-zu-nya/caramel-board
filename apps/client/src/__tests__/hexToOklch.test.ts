import { hexToOklch } from '@/lib/utils';

describe('hexToOklch', () => {
  it('should convert blue colors correctly', () => {
    // Test various blue colors
    const testCases = [
      { hex: '#0066CC', name: 'Medium Blue' },
      { hex: '#0000FF', name: 'Pure Blue' },
      { hex: '#4169E1', name: 'Royal Blue' },
      { hex: '#1E90FF', name: 'Dodger Blue' },
      { hex: '#87CEEB', name: 'Sky Blue' },
    ];

    testCases.forEach(({ hex, name }) => {
      const result = hexToOklch(hex);
      console.log(`${name} (${hex}): ${result}`);

      // Verify the result format
      expect(result).toMatch(/^oklch\([0-9.]+\s+[0-9.]+\s+[0-9.]+\)$/);

      // Extract values
      const match = result.match(/oklch\(([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\)/);
      expect(match).not.toBeNull();

      if (match) {
        const [, lightness, chroma, hue] = match;
        const L = Number.parseFloat(lightness);
        const C = Number.parseFloat(chroma);
        const H = Number.parseFloat(hue);

        // Lightness should be between 0 and 1
        expect(L).toBeGreaterThanOrEqual(0);
        expect(L).toBeLessThanOrEqual(1);

        // Chroma should be positive
        expect(C).toBeGreaterThanOrEqual(0);

        // Hue should be between 0 and 360
        expect(H).toBeGreaterThanOrEqual(0);
        expect(H).toBeLessThan(360);

        // For blue colors, hue should be in the blue range (roughly 200-280)
        expect(H).toBeGreaterThan(180);
        expect(H).toBeLessThan(300);
      }
    });
  });

  it('should handle hex colors with and without #', () => {
    const color1 = hexToOklch('#0066CC');
    const color2 = hexToOklch('0066CC');
    expect(color1).toBe(color2);
  });

  it('should convert other colors correctly', () => {
    // Test a few other colors to ensure the algorithm works generally
    const testCases = [
      { hex: '#FF0000', name: 'Red', expectedHueRange: [0, 60] },
      { hex: '#00FF00', name: 'Green', expectedHueRange: [120, 180] },
      { hex: '#FFFFFF', name: 'White', expectedLightness: 1 },
      { hex: '#000000', name: 'Black', expectedLightness: 0 },
    ];

    testCases.forEach(({ hex, name, expectedHueRange, expectedLightness }) => {
      const result = hexToOklch(hex);
      console.log(`${name} (${hex}): ${result}`);

      const match = result.match(/oklch\(([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\)/);
      if (match) {
        const [, lightness, , hue] = match;
        const L = Number.parseFloat(lightness);
        const H = Number.parseFloat(hue);

        if (expectedLightness !== undefined) {
          expect(L).toBeCloseTo(expectedLightness, 1);
        }

        if (expectedHueRange) {
          expect(H).toBeGreaterThanOrEqual(expectedHueRange[0]);
          expect(H).toBeLessThanOrEqual(expectedHueRange[1]);
        }
      }
    });
  });
});
