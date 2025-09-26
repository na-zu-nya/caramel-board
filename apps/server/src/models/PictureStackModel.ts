import type { Stack } from '@prisma/client';
import { DataStorage } from '../lib/DataStorage';
import { getPrisma } from '../lib/Repository';
import { ServerError } from '../utils/ServerError';
import { getExtension } from '../utils/functions';
import { generateThumbnail } from '../utils/generateThumbnail';

// interface PictureStackModel {
//   file: string,
//   thumbnail: string,
//   createdDate: string,
//   tags: []
// }

export class PictureStackModel {
  static async create(fileKey: string, name: string): Promise<Stack> {
    const prisma = getPrisma();
    const type = getExtension(fileKey);
    const thumbnailKey = await generateThumbnail(fileKey, type);
    const hash = await DataStorage.getHash(fileKey);

    const existsItem = await prisma.asset.findFirst({
      where: {
        hash,
      },
    });
    if (existsItem) {
      throw new ServerError(400, 'Item Exists');
    }

    const stack = await prisma.stack.create({
      data: {
        name,
        thumbnail: thumbnailKey,
        mediaType: 'image',
        dataSetId: 1,
        meta: {},
      },
    });

    await prisma.asset.create({
      data: {
        file: fileKey,
        originalName: name,
        thumbnail: thumbnailKey,
        fileType: type,
        meta: {},
        stackId: stack.id,
        hash,
      },
    });

    return stack;
  }
}
