import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { mediaAssets } from "../schema/media-assets.js";
import { assertTenantActive } from "./tenants.js";
import type { Db } from "../types.js";

export interface MediaAssetRecord {
  id: string;
  tenantId: string;
  guildId: bigint;
  assetType: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Calculates total storage used across all media assets for a tenant in bytes.
 */
export async function getTenantTotalStorageUsed(db: Db, tenantId: string): Promise<number> {
  const [row] = await db
    .select({
      totalBytes: sql<number>`COALESCE(SUM(${mediaAssets.fileSizeBytes}), 0)`.as("total_bytes"),
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.tenantId, tenantId));

  return Number(row?.totalBytes ?? 0);
}

/**
 * Retrieves a specific media asset for a guild by asset type (e.g. "BOT_AVATAR").
 */
export async function getMediaAssetForGuild(
  db: Db,
  guildId: bigint,
  assetType: string,
): Promise<MediaAssetRecord | undefined> {
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.guildId, guildId), eq(mediaAssets.assetType, assetType)))
    .limit(1);

  return row as MediaAssetRecord | undefined;
}

/**
 * Upserts a media asset for a guild. If a previous asset of the same type exists,
 * returns its previous storagePath so the physical file can be cleaned up from disk.
 */
export async function upsertMediaAsset(
  db: Db,
  input: {
    tenantId: string;
    guildId: bigint;
    assetType: string;
    storagePath: string;
    fileSizeBytes: number;
    mimeType: string;
  },
): Promise<{ asset: MediaAssetRecord; previousStoragePath: string | null }> {
  await assertTenantActive(db, input.tenantId);

  const existing = await getMediaAssetForGuild(db, input.guildId, input.assetType);
  const previousStoragePath = existing?.storagePath ?? null;

  if (existing) {
    await db
      .update(mediaAssets)
      .set({
        storagePath: input.storagePath,
        fileSizeBytes: input.fileSizeBytes,
        mimeType: input.mimeType,
        tenantId: input.tenantId,
      })
      .where(eq(mediaAssets.id, existing.id));

    const updated = await getMediaAssetForGuild(db, input.guildId, input.assetType);
    return { asset: updated!, previousStoragePath };
  }

  const id = randomUUID();
  await db.insert(mediaAssets).values({
    id,
    tenantId: input.tenantId,
    guildId: input.guildId,
    assetType: input.assetType,
    storagePath: input.storagePath,
    fileSizeBytes: input.fileSizeBytes,
    mimeType: input.mimeType,
  });

  const created = await getMediaAssetForGuild(db, input.guildId, input.assetType);
  return { asset: created!, previousStoragePath: null };
}

/**
 * Deletes a media asset and returns its storagePath so the physical file can be removed.
 */
export async function deleteMediaAsset(
  db: Db,
  tenantId: string,
  guildId: bigint,
  assetType: string,
): Promise<string | null> {
  const existing = await getMediaAssetForGuild(db, guildId, assetType);
  if (!existing || existing.tenantId !== tenantId) {
    return null;
  }

  await db.delete(mediaAssets).where(eq(mediaAssets.id, existing.id));
  return existing.storagePath;
}
