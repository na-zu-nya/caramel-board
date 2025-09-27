import { DataStorage } from '../lib/DataStorage';
import { ImageConverter } from '../lib/ImageConverter';
import { getPrisma } from '../lib/Repository';
import type { valueOf as ValueOf } from '../types/typeUtils';

const prisma = getPrisma();

export async function updateAssets(
  directory: string,
  _mediaType: ValueOf<{ image: 'image'; comic: 'comic'; video: 'video' }> | string,
  updateThumbnail = false
) {
  const files = (await DataStorage.list(directory)).map((entry) => `${directory}/${entry.name}`);
  const entries = [];
  for (const file of files) {
    const f = await prisma.asset.findFirst({ where: { file } });
    // const info = ImageConverter.getInfo(file);
    // if (!f) {
    //   // f = await prisma.asset.create({
    //   //   data: {
    //   //     file: file,
    //   //     thumbnail: '',
    //   //     fileType: info.type,
    //   //     updateAt: formatDateTime(),
    //   //     meta: {}
    //   //   }
    //   // });
    // }

    if (updateThumbnail || !f.thumbnail) {
      const thumbnail = await ImageConverter.createThumbnail(file, 512, false);
      console.log(thumbnail);
      f.thumbnail = thumbnail;
      await prisma.asset.update({
        where: {
          id: f.id,
        },
        data: f,
      });
    }
    entries.push(f);
  }

  return entries;
}
