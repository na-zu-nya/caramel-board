import type { DatabaseSync } from 'node:sqlite';
import { getStandaloneSqlite } from './sqlite';
import { StackAssetService } from './stack/asset-service';
import { StackAutoTagReadService } from './stack/auto-tag-read-service';
import { StackBulkService } from './stack/bulk-service';
import { StackCollectionLinkService } from './stack/collection-link-service';
import { StackColorService } from './stack/color-service';
import { StackFavoriteService } from './stack/favorite-service';
import { StackFileService } from './stack/file-service';
import { StackMediaTypeService } from './stack/media-type-service';
import { StackMetadataService } from './stack/metadata-service';
import { StackPreviewService } from './stack/preview-service';
import { StackQueryService } from './stack/query-service';
import { StackSimilarService } from './stack/similar-service';
import {
  type SetStackThumbnailSourceInput,
  StackThumbnailService,
} from './stack/thumbnail-service';
import type {
  AddAssetWithFileOptions,
  CreateStackWithFileInput,
  StandaloneFileInput,
  StandaloneStackListParams,
} from './stack/types';
import { StackWriterService } from './stack/writer-service';

export type { StandaloneStackListParams } from './stack/types';

export class StandaloneStackRepository {
  private assetService: StackAssetService;
  private autoTagReadService: StackAutoTagReadService;
  private bulkService: StackBulkService;
  private collectionLinkService: StackCollectionLinkService;
  private colorService: StackColorService;
  private favoriteService: StackFavoriteService;
  private fileService: StackFileService;
  private mediaTypeService: StackMediaTypeService;
  private metadataService: StackMetadataService;
  private previewService: StackPreviewService;
  private queryService: StackQueryService;
  private similarService: StackSimilarService;
  private thumbnailService: StackThumbnailService;
  private writerService: StackWriterService;

  constructor(db: DatabaseSync = getStandaloneSqlite()) {
    this.thumbnailService = new StackThumbnailService(db);
    this.autoTagReadService = new StackAutoTagReadService(db);
    this.collectionLinkService = new StackCollectionLinkService(db);
    this.colorService = new StackColorService(db);
    this.favoriteService = new StackFavoriteService(db);
    this.mediaTypeService = new StackMediaTypeService(db);
    this.metadataService = new StackMetadataService(db);
    this.assetService = new StackAssetService(db, this.mediaTypeService, this.thumbnailService);
    this.fileService = new StackFileService(
      db,
      this.colorService,
      this.mediaTypeService,
      this.metadataService,
      this.thumbnailService
    );
    this.previewService = new StackPreviewService(db);
    this.queryService = new StackQueryService(
      db,
      this.assetService,
      this.metadataService,
      this.autoTagReadService
    );
    this.similarService = new StackSimilarService(db);
    this.bulkService = new StackBulkService(
      db,
      this.mediaTypeService,
      this.metadataService,
      this.favoriteService,
      this.thumbnailService
    );
    this.writerService = new StackWriterService(db);
  }

  getPaginated(params: StandaloneStackListParams) {
    return this.queryService.getPaginated(params);
  }

  getById(id: number, dataSetId?: number) {
    return this.queryService.getById(id, dataSetId);
  }

  getStackIdsByDataset(dataSetId: number) {
    return this.queryService.getStackIdsByDataset(dataSetId);
  }

  refreshActualMediaType(stackId: number) {
    return this.mediaTypeService.refreshStackActualMediaType(stackId);
  }

  refreshActualMediaTypesForDataset(dataSetId: number) {
    return this.mediaTypeService.refreshDatasetActualMediaTypes(dataSetId);
  }

  getAssetsByStackId(stackId: number, dataSetId: number) {
    return this.assetService.getAssetsByStackId(stackId, dataSetId);
  }

  getOriginalAssets(dataSetId: number, options: { stackIds: number[]; assetIds: number[] }) {
    return this.assetService.getOriginalAssets(dataSetId, options);
  }

  getSimilarByStackIds(
    dataSetId: number,
    sourceStackIds: number[],
    options: { limit: number; offset: number; threshold?: number }
  ) {
    return this.similarService.getSimilarByStackIds(dataSetId, sourceStackIds, options, (id, ds) =>
      this.getById(id, ds)
    );
  }

  async regeneratePreviews(stackId: number, dataSetId: number, options: { force?: boolean } = {}) {
    return this.previewService.regeneratePreviews(stackId, dataSetId, options);
  }

  async createStackWithFile(input: CreateStackWithFileInput) {
    return this.fileService.createStackWithFile(input, (id, dataSetId) =>
      this.getById(id, dataSetId)
    );
  }

  async addAssetWithFile(
    stackId: number,
    file: StandaloneFileInput,
    options: AddAssetWithFileOptions = {}
  ) {
    return this.fileService.addAssetWithFile(stackId, file, options);
  }

  updateStack(
    stackId: number,
    dataSetId: number,
    data: {
      name?: string;
      thumbnail?: string;
      meta?: Record<string, unknown>;
      mediaType?: 'image' | 'comic' | 'video';
    }
  ) {
    return this.writerService.updateStack(stackId, dataSetId, data, (id, ds) =>
      this.getById(id, ds)
    );
  }

  stackBelongsToDataset(stackId: number, dataSetId: number) {
    return this.queryService.stackBelongsToDataset(stackId, dataSetId);
  }

  updateAssetMeta(assetId: number, dataSetId: number, meta: Record<string, unknown>) {
    return this.assetService.updateAssetMeta(assetId, dataSetId, meta);
  }

  updateAssetOrder(assetId: number, order: number) {
    return this.assetService.updateAssetOrder(assetId, order);
  }

  toggleStackFavorite(stackId: number, favorited: boolean) {
    return this.favoriteService.toggleStackFavorite(stackId, favorited);
  }

  toggleAssetFavorite(assetId: number, favorited: boolean) {
    return this.favoriteService.toggleAssetFavorite(assetId, favorited);
  }

  likeStack(stackId: number, assetId?: number) {
    return this.favoriteService.likeStack(stackId, assetId);
  }

  likeAsset(assetId: number) {
    return this.favoriteService.likeAsset(assetId);
  }

  addTag(stackId: number, tagTitle: string) {
    return this.metadataService.addTag(stackId, tagTitle);
  }

  removeTag(stackId: number, tagTitle: string) {
    return this.metadataService.removeTag(stackId, tagTitle);
  }

  updateAuthor(stackId: number, name: string) {
    return this.metadataService.updateAuthor(stackId, name);
  }

  deleteStack(stackId: number) {
    return this.bulkService.deleteStack(stackId);
  }

  deleteAsset(assetId: number) {
    return this.assetService.deleteAsset(assetId);
  }

  separateAsset(assetId: number) {
    return this.assetService.separateAsset(assetId, (id) => this.getById(id));
  }

  bulkAddTags(stackIds: number[], tags: string[]) {
    return this.bulkService.bulkAddTags(stackIds, tags);
  }

  bulkSetAuthor(stackIds: number[], author: string) {
    return this.bulkService.bulkSetAuthor(stackIds, author);
  }

  bulkSetMediaType(stackIds: number[], mediaType: 'image' | 'comic' | 'video') {
    return this.bulkService.bulkSetMediaType(stackIds, mediaType);
  }

  bulkSetFavorite(stackIds: number[], favorited: boolean) {
    return this.bulkService.bulkSetFavorite(stackIds, favorited);
  }

  async bulkRefreshThumbnails(stackIds: number[]) {
    return this.bulkService.bulkRefreshThumbnails(stackIds);
  }

  async setStackThumbnailSource(stackId: number, input: SetStackThumbnailSourceInput) {
    return this.thumbnailService.setStackThumbnailSource(stackId, input);
  }

  bulkRemoveStacks(stackIds: number[]) {
    return this.bulkService.bulkRemoveStacks(stackIds);
  }

  mergeStacks(targetId: number, sourceIds: number[]) {
    return this.bulkService.mergeStacks(targetId, sourceIds, (id) => this.getById(id));
  }

  getCollectionIdsByStackId(stackId: number) {
    return this.collectionLinkService.getCollectionIdsByStackId(stackId);
  }

  getFavoriteItems(dataSetId: number, limit: number, offset: number) {
    return this.favoriteService.getFavoriteItems(dataSetId, limit, offset);
  }

  async refreshStackThumbnail(
    stackId: number,
    options: { refreshActualMediaType?: boolean; force?: boolean } = {}
  ) {
    const refreshed = await this.thumbnailService.regenerateAssetThumbnails(stackId, {
      force: options.force ?? true,
    });
    if (refreshed && (options.refreshActualMediaType ?? true)) {
      this.mediaTypeService.refreshStackActualMediaType(stackId);
    }
    return refreshed;
  }
}
