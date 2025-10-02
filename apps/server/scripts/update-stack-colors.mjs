#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '../../..', '.env');
const serverEnvPath = path.resolve(__dirname, '..', '.env');

loadEnv({ path: rootEnvPath });
loadEnv({ path: serverEnvPath });

const prisma = new PrismaClient();

const [, , stackIdArg] = process.argv;

if (!stackIdArg) {
  console.error('スタックIDを指定してください (例: npm run update-stack-colors 8641)。');
  process.exit(1);
}

const stackId = Number.parseInt(stackIdArg, 10);
if (Number.isNaN(stackId)) {
  console.error('数値のスタックIDを指定してください。');
  process.exit(1);
}

const isDominantColor = (value) => {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.r === 'number' &&
    typeof value.g === 'number' &&
    typeof value.b === 'number' &&
    typeof value.hex === 'string' &&
    typeof value.percentage === 'number'
  );
};

const rgbToHex = (r, g, b) => {
  return (
    '#' +
    [r, g, b]
      .map((channel) => {
        const hex = channel.toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
      })
      .join('')
      .toUpperCase()
  );
};

const rgbToHsl = (r, g, b) => {
  let red = r / 255;
  let green = g / 255;
  let blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case red:
        h = (green - blue) / d + (green < blue ? 6 : 0);
        break;
      case green:
        h = (blue - red) / d + 2;
        break;
      default:
        h = (red - green) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const getHueCategory = (hue) => {
  let normalizedHue = hue;
  if (normalizedHue < 0) normalizedHue += 360;
  if (normalizedHue >= 360) normalizedHue -= 360;

  if (normalizedHue >= 345 || normalizedHue < 15) return 'red';
  if (normalizedHue >= 15 && normalizedHue < 45) return 'orange';
  if (normalizedHue >= 45 && normalizedHue < 75) return 'yellow';
  if (normalizedHue >= 75 && normalizedHue < 135) return 'green';
  if (normalizedHue >= 135 && normalizedHue < 195) return 'cyan';
  if (normalizedHue >= 195 && normalizedHue < 255) return 'blue';
  if (normalizedHue >= 255 && normalizedHue < 345) return 'violet';
  return 'gray';
};

const createDominantColor = (r, g, b, percentage) => {
  const hsl = rgbToHsl(r, g, b);
  return {
    r,
    g,
    b,
    hex: rgbToHex(r, g, b),
    percentage,
    hue: hsl.h,
    saturation: hsl.s,
    lightness: hsl.l,
    hueCategory: getHueCategory(hsl.h),
  };
};

const aggregateStackColors = (assetColors) => {
  const colorMap = new Map();

  for (const colors of assetColors) {
    for (const color of colors) {
      const key = color.hex;
      const existing = colorMap.get(key);

      if (existing) {
        existing.weight += color.percentage;
      } else {
        colorMap.set(key, { color: { ...color }, weight: color.percentage });
      }
    }
  }

  return Array.from(colorMap.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((entry) => createDominantColor(entry.color.r, entry.color.g, entry.color.b, entry.weight / assetColors.length));
};

const main = async () => {
  console.log(`スタック ${stackId} のdominantColorsを再計算します...`);

  const assets = await prisma.asset.findMany({
    where: { stackId },
    select: { dominantColors: true },
  });

  const validColorSets = assets
    .map((asset) => (Array.isArray(asset.dominantColors) ? asset.dominantColors.filter(isDominantColor) : []))
    .filter((colors) => colors.length > 0);

  if (validColorSets.length === 0) {
    await prisma.stack.update({ where: { id: stackId }, data: { dominantColors: null } });
    console.log('色情報が見つからなかったため、dominantColorsをnullにリセットしました。');
    return;
  }

  const aggregated = aggregateStackColors(validColorSets);
  await prisma.stack.update({ where: { id: stackId }, data: { dominantColors: aggregated } });

  console.log(`代表色を${aggregated.length}件更新しました。`);
};

main()
  .catch((error) => {
    console.error('更新処理に失敗しました:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
