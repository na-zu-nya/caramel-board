import sharp from 'sharp';
import { DataStorage } from '../lib/DataStorage';

export interface AssetDimensions {
  width: number | null;
  height: number | null;
}

const normalizeDimension = (value: number | undefined) =>
  Number.isFinite(value) && value !== undefined && value > 0 ? Math.round(value) : null;

const shouldSwapByOrientation = (orientation: number | undefined) =>
  orientation !== undefined && orientation >= 5 && orientation <= 8;

export async function readAssetDimensions(fileKey: string): Promise<AssetDimensions> {
  try {
    const metadata = await sharp(DataStorage.getPath(fileKey), {
      failOnError: false,
      sequentialRead: true,
    }).metadata();
    const rawWidth = normalizeDimension(metadata.width);
    const rawHeight = normalizeDimension(metadata.height);
    if (rawWidth === null || rawHeight === null) {
      return { width: null, height: null };
    }
    if (shouldSwapByOrientation(metadata.orientation)) {
      return { width: rawHeight, height: rawWidth };
    }
    return { width: rawWidth, height: rawHeight };
  } catch {
    return { width: null, height: null };
  }
}
