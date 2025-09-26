import fs from 'fs';
import sharp from 'sharp';

export interface DominantColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  percentage: number;
  // 色相・トーン情報を追加
  hue: number; // 色相 (0-360)
  saturation: number; // 彩度 (0-100) - 淡い〜ビビッド
  lightness: number; // 明度 (0-100) - 暗い〜明るい
  hueCategory: string; // 色相カテゴリ ('red', 'orange', 'yellow', etc.)
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
      // ファイルの存在確認
      if (!fs.existsSync(imagePath)) {
        console.error(`File not found: ${imagePath}`);
        return [];
      }

      return await ColorExtractor.extractColorsWithAdvancedAlgorithm(imagePath, numColors);
    } catch (error) {
      console.error('Error extracting dominant colors:', error);
      return [];
    }
  }

  /**
   * 高度な色抽出アルゴリズム
   */
  private static async extractColorsWithAdvancedAlgorithm(
    imagePath: string,
    numColors: number
  ): Promise<DominantColor[]> {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      console.error(`Invalid image metadata: ${imagePath}`);
      return [];
    }

    // 適切なサイズにリサイズ（最大150x150、アスペクト比維持）
    const maxSize = 150;
    const scale = Math.min(maxSize / metadata.width, maxSize / metadata.height);
    const newWidth = Math.round(metadata.width * scale);
    const newHeight = Math.round(metadata.height * scale);

    const { data, info } = await image
      .resize(newWidth, newHeight, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = info.width * info.height;
    const centerX = Math.floor(info.width / 2);
    const centerY = Math.floor(info.height / 2);

    // 重み付きカラーマップ
    const colorMap = new Map<
      string,
      { weight: number; saturation: number; positions: Array<{ x: number; y: number }> }
    >();

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 1. 彩度フィルタリング：グレーや低彩度色を除外
        const saturation = ColorExtractor.calculateSaturation(r, g, b);
        if (saturation < 0.15) continue; // 彩度が低すぎる色はスキップ

        // 2. 明度フィルタリング：真っ白や真っ黒を除外
        const brightness = (r + g + b) / 3;
        if (brightness < 20 || brightness > 235) continue;

        // 3. 中央重み付け：画像中央に近いほど重要度を上げる
        const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
        const centerWeight = 1 + (1 - distanceFromCenter / maxDistance); // 1.0-2.0の範囲

        // 4. エッジ重み付け：エッジ近辺の色を重視
        const edgeWeight = ColorExtractor.calculateEdgeWeight(
          data,
          x,
          y,
          info.width,
          info.height,
          info.channels
        );

        // 5. 色の量子化（より細かく）
        const qr = Math.round(r / 12) * 12;
        const qg = Math.round(g / 12) * 12;
        const qb = Math.round(b / 12) * 12;

        const key = `${qr},${qg},${qb}`;
        const totalWeight = centerWeight * edgeWeight * (1 + saturation);

        const existing = colorMap.get(key);
        if (existing) {
          existing.weight += totalWeight;
          existing.positions.push({ x, y });
        } else {
          colorMap.set(key, {
            weight: totalWeight,
            saturation,
            positions: [{ x, y }],
          });
        }
      }
    }

    // 6. 色をスコアでソート（重み + 彩度 + 分散度）
    const colorEntries = Array.from(colorMap.entries()).map(([key, data]) => {
      const [r, g, b] = key.split(',').map(Number);

      // 位置の分散度を計算（広く分布している色ほど重要）
      const variance = ColorExtractor.calculatePositionVariance(data.positions);
      const normalizedVariance = Math.min(variance / (info.width * info.height), 1);

      const score = data.weight * (1 + data.saturation) * (1 + normalizedVariance * 0.5);

      return {
        r,
        g,
        b,
        score,
        weight: data.weight,
        saturation: data.saturation,
        key,
      };
    });

    // 7. スコア順でソートし、類似色をマージ
    const sortedColors = colorEntries.sort((a, b) => b.score - a.score);
    const dominantColors: DominantColor[] = [];
    const usedColors = new Set<string>();

    for (const color of sortedColors) {
      if (dominantColors.length >= numColors) break;
      if (usedColors.has(color.key)) continue;

      // 類似色チェック（より厳密に）
      let merged = false;
      for (const used of usedColors) {
        const [ur, ug, ub] = used.split(',').map(Number);
        const distance = ColorExtractor.calculateColorDistance(
          color.r,
          color.g,
          color.b,
          ur,
          ug,
          ub
        );

        if (distance < 35) {
          // より厳密な閾値
          merged = true;
          break;
        }
      }

      if (!merged) {
        usedColors.add(color.key);
        dominantColors.push(
          ColorExtractor.createDominantColor(color.r, color.g, color.b, color.weight / pixelCount)
        );
      }
    }

    return dominantColors;
  }

  /**
   * HSVの彩度を計算
   */
  private static calculateSaturation(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (max === 0) return 0;
    return delta / max;
  }

  /**
   * エッジ重みを計算（簡易的なソーベルフィルタ）
   */
  private static calculateEdgeWeight(
    data: Buffer,
    x: number,
    y: number,
    width: number,
    height: number,
    channels: number
  ): number {
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      return 1.5; // 境界は重要度を上げる
    }

    const getGrayValue = (px: number, py: number): number => {
      const i = (py * width + px) * channels;
      return (data[i] + data[i + 1] + data[i + 2]) / 3;
    };

    // 簡易的なエッジ検出
    const center = getGrayValue(x, y);
    const left = getGrayValue(x - 1, y);
    const right = getGrayValue(x + 1, y);
    const top = getGrayValue(x, y - 1);
    const bottom = getGrayValue(x, y + 1);

    const edgeStrength =
      Math.abs(center - left) +
      Math.abs(center - right) +
      Math.abs(center - top) +
      Math.abs(center - bottom);

    return 1 + Math.min(edgeStrength / 100, 1); // 1.0-2.0の範囲
  }

  /**
   * 位置の分散度を計算
   */
  private static calculatePositionVariance(positions: Array<{ x: number; y: number }>): number {
    if (positions.length < 2) return 0;

    const meanX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
    const meanY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;

    const variance =
      positions.reduce((sum, p) => {
        return sum + Math.pow(p.x - meanX, 2) + Math.pow(p.y - meanY, 2);
      }, 0) / positions.length;

    return variance;
  }

  /**
   * より正確な色距離計算（CIE Delta E に近似）
   */
  private static calculateColorDistance(
    r1: number,
    g1: number,
    b1: number,
    r2: number,
    g2: number,
    b2: number
  ): number {
    // 重み付きユークリッド距離（人間の色知覚に近い）
    const rmean = (r1 + r2) / 2;
    const deltaR = r1 - r2;
    const deltaG = g1 - g2;
    const deltaB = b1 - b2;

    const weightR = 2 + rmean / 256;
    const weightG = 4.0;
    const weightB = 2 + (255 - rmean) / 256;

    return Math.sqrt(
      weightR * deltaR * deltaR + weightG * deltaG * deltaG + weightB * deltaB * deltaB
    );
  }

  /**
   * RGB値を16進数カラーコードに変換
   */
  static rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
        .toUpperCase()
    );
  }

  /**
   * 2つの色の類似度を計算（0-1の範囲、1が完全一致）
   */
  static calculateColorSimilarity(color1: DominantColor, color2: DominantColor): number {
    const distance = Math.sqrt(
      Math.pow(color1.r - color2.r, 2) +
        Math.pow(color1.g - color2.g, 2) +
        Math.pow(color1.b - color2.b, 2)
    );

    // 最大距離は√(255²×3) ≈ 441.67
    const maxDistance = Math.sqrt(255 * 255 * 3);
    return 1 - distance / maxDistance;
  }

  /**
   * スタックの全アセットから代表色を集計
   */
  static aggregateStackColors(assetColors: DominantColor[][]): DominantColor[] {
    const colorMap = new Map<string, { color: DominantColor; weight: number }>();

    // 全アセットの色を集計
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

    // 重み順でソートし、上位3色を返す
    return Array.from(colorMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((item) =>
        ColorExtractor.createDominantColor(
          item.color.r,
          item.color.g,
          item.color.b,
          item.weight / assetColors.length
        )
      );
  }

  /**
   * RGBからHSLに変換
   */
  static rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  /**
   * 色相から色相カテゴリを判定（7色に簡略化）
   */
  static getHueCategory(hue: number): string {
    if (hue < 0) hue += 360;
    if (hue >= 360) hue -= 360;

    if (hue >= 345 || hue < 15) return 'red';
    if (hue >= 15 && hue < 45) return 'orange';
    if (hue >= 45 && hue < 75) return 'yellow';
    if (hue >= 75 && hue < 135) return 'green'; // 緑系統を統合
    if (hue >= 135 && hue < 195) return 'cyan'; // シアン系統を統合
    if (hue >= 195 && hue < 255) return 'blue'; // 青系統を統合
    if (hue >= 255 && hue < 345) return 'violet'; // 紫系統を統合

    return 'gray';
  }

  /**
   * DominantColorオブジェクトを作成（HSL情報付き）
   */
  static createDominantColor(r: number, g: number, b: number, percentage: number): DominantColor {
    const hsl = ColorExtractor.rgbToHsl(r, g, b);
    return {
      r,
      g,
      b,
      hex: ColorExtractor.rgbToHex(r, g, b),
      percentage,
      hue: hsl.h,
      saturation: hsl.s,
      lightness: hsl.l,
      hueCategory: ColorExtractor.getHueCategory(hsl.h),
    };
  }
}
