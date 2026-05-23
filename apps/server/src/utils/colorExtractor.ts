import fs from 'node:fs';
import {
  aggregateColors,
  type ColorlipColor,
  createDominantColor,
  getHueCategory,
  type HueCategory,
  rgbToHex,
  rgbToHsl,
} from 'colorlip';
import { getColors } from 'colorlip/sharp';

export interface DominantColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  percentage: number;
  hue: number;
  saturation: number;
  lightness: number;
  hueCategory: HueCategory;
}

function toDominantColor(color: ColorlipColor): DominantColor {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    hex: color.hex,
    percentage: color.percentage,
    hue: color.hue,
    saturation: color.saturation,
    lightness: color.lightness,
    hueCategory: color.hueCategory,
  };
}

function toColorlipColor(color: DominantColor): ColorlipColor {
  return createDominantColor(color.r, color.g, color.b, color.percentage);
}

export class ColorExtractor {
  /**
   * 画像から代表色を抽出
   * @param imagePath 画像のファイルパス
   * @param numColors 抽出する色の数（デフォルト: 3）
   * @returns 代表色の配列
   */
  static async extractDominantColors(imagePath: string, numColors = 3): Promise<DominantColor[]> {
    try {
      if (!fs.existsSync(imagePath)) {
        console.error(`File not found: ${imagePath}`);
        return [];
      }

      const colors = await getColors(imagePath, { numColors });
      return colors.map(toDominantColor);
    } catch (error) {
      console.error('Error extracting dominant colors:', error);
      return [];
    }
  }

  /**
   * RGB値を16進数カラーコードに変換
   */
  static rgbToHex(r: number, g: number, b: number): string {
    return rgbToHex(r, g, b);
  }

  /**
   * 2つの色の類似度を計算（0-1の範囲、1が完全一致）
   */
  static calculateColorSimilarity(color1: DominantColor, color2: DominantColor): number {
    const distance = Math.sqrt(
      (color1.r - color2.r) ** 2 + (color1.g - color2.g) ** 2 + (color1.b - color2.b) ** 2
    );

    // 最大距離は√(255²×3) ≈ 441.67
    const maxDistance = Math.sqrt(255 * 255 * 3);
    return 1 - distance / maxDistance;
  }

  /**
   * スタックの全アセットから代表色を集計
   */
  static aggregateStackColors(assetColors: DominantColor[][]): DominantColor[] {
    const colorlipColors = assetColors.map((colors) => colors.map(toColorlipColor));
    return aggregateColors(colorlipColors, 3).map(toDominantColor);
  }

  /**
   * RGBからHSLに変換
   */
  static rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    return rgbToHsl(r, g, b);
  }

  /**
   * 色相から色相カテゴリを判定
   */
  static getHueCategory(hue: number): string {
    return getHueCategory(hue);
  }

  /**
   * DominantColorオブジェクトを作成（HSL情報付き）
   */
  static createDominantColor(r: number, g: number, b: number, percentage: number): DominantColor {
    return toDominantColor(createDominantColor(r, g, b, percentage));
  }
}
