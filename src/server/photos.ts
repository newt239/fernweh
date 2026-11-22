import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import * as z from "zod";

import * as schema from "#/db/schema.ts";
import { albumPhotos, albums, photos } from "#/db/schema.ts";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "#/lib/upload-constraints.ts";
import { MIME_EXT, signPutUrl } from "#/server/storage.ts";
import { getCurrentUserId } from "#/server/user.ts";

const ID_CHUNK_SIZE = 90;

const R2_DELETE_CHUNK_SIZE = 1000;

const createPhotoUploadInput = z.object({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  contentType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
});

export const createPhotoUpload = createServerFn({ method: "POST" })
  .validator(createPhotoUploadInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const [existing] = await db
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.userId, userId), eq(photos.contentHash, data.contentHash)))
      .limit(1);
    if (existing) {
      return { kind: "duplicate", photoId: existing.id, success: true } as const;
    }
    const photoId = nanoid();
    const extension = MIME_EXT[data.contentType];
    const originalKey = `users/${userId}/photos/${photoId}/original.${extension}`;
    const originalUrl = await signPutUrl(originalKey, data.contentType);
    return { kind: "created", originalKey, originalUrl, photoId, success: true } as const;
  });

const finalizePhotoInput = z.object({
  altitude: z.number().nullable().optional(),
  aperture: z.number().nullable().optional(),
  cameraMake: z.string().nullable().optional(),
  cameraModel: z.string().nullable().optional(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  focalLength: z.number().nullable().optional(),
  height: z.number().int().positive(),
  iso: z.number().int().nullable().optional(),
  latitude: z.number().nullable().optional(),
  lensModel: z.string().nullable().optional(),
  longitude: z.number().nullable().optional(),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  orientation: z.number().int().nullable().optional(),
  originalKey: z.string().min(1),
  photoId: z.string().min(1),
  placeholder: z.string().max(64).nullable().optional(),
  rawExif: z.string().nullable().optional(),
  shutterSpeed: z.string().nullable().optional(),
  takenAt: z.string().datetime().nullable().optional(),
  takenAtOffsetMinutes: z.number().int().min(-720).max(840).nullable().optional(),
  width: z.number().int().positive(),
});

export const finalizePhoto = createServerFn({ method: "POST" })
  .validator(finalizePhotoInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const keyPattern = new RegExp(`^users/${userId}/photos/${data.photoId}/[^/]+$`);
    if (!keyPattern.test(data.originalKey)) {
      return { error: "アップロード先が正しくありません", success: false } as const;
    }

    const head = await env.MY_BUCKET.head(data.originalKey);
    if (!head) {
      return { error: "アップロードされた画像が見つかりません", success: false } as const;
    }

    const uploadedType = head.httpMetadata?.contentType?.toLowerCase();
    const allowedType = ALLOWED_MIME_TYPES.some((mime) => mime === uploadedType);
    if (head.size > MAX_FILE_SIZE || !allowedType) {
      await env.MY_BUCKET.delete(data.originalKey).catch(() => {});
      return { error: "アップロードされた画像を受け付けられません", success: false } as const;
    }

    let storageKey = data.originalKey;
    let { size: fileSize } = head;
    let { mimeType } = data;
    // HEIC は原本をそのまま配信すると Chrome などで表示できないため JPEG に置き換える
    if (uploadedType === "image/heic" || uploadedType === "image/heif") {
      const source = await env.MY_BUCKET.get(data.originalKey);
      if (!source) {
        return { error: "アップロードされた画像が見つかりません", success: false } as const;
      }
      // R2 の body は要素の型を持たないが実体はバイト列なのでそのまま渡す
      // eslint-disable-next-line typescript/no-unsafe-argument
      const converted = await env.IMAGES.input(source.body)
        .output({ format: "image/jpeg", quality: 90 })
        .catch(() => null);
      if (!converted) {
        await env.MY_BUCKET.delete(data.originalKey).catch(() => {});
        return { error: "画像を JPEG に変換できませんでした", success: false } as const;
      }
      storageKey = `users/${userId}/photos/${data.photoId}/original.jpg`;
      const stored = await env.MY_BUCKET.put(storageKey, await converted.response().arrayBuffer(), {
        httpMetadata: { contentType: "image/jpeg" },
      });
      await env.MY_BUCKET.delete(data.originalKey).catch(() => {});
      fileSize = stored.size;
      mimeType = "image/jpeg";
    }

    const db = drizzle(env.DB, { schema });
    try {
      await db.insert(photos).values({
        altitude: data.altitude ?? null,
        aperture: data.aperture ?? null,
        cameraMake: data.cameraMake ?? null,
        cameraModel: data.cameraModel ?? null,
        contentHash: data.contentHash,
        fileSize,
        focalLength: data.focalLength ?? null,
        height: data.height,
        id: data.photoId,
        iso: data.iso ?? null,
        latitude: data.latitude ?? null,
        lensModel: data.lensModel ?? null,
        longitude: data.longitude ?? null,
        mimeType,
        orientation: data.orientation ?? null,
        placeholder: data.placeholder ?? null,
        rawExif: data.rawExif ?? null,
        shutterSpeed: data.shutterSpeed ?? null,
        storageKey,
        takenAt: data.takenAt ? new Date(data.takenAt) : null,
        takenAtOffsetMinutes: data.takenAtOffsetMinutes ?? null,
        userId,
        width: data.width,
      });
    } catch (error) {
      console.error("finalizePhoto: photos への insert に失敗しました", error);
      await env.MY_BUCKET.delete(storageKey).catch(() => {});
      const [duplicate] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.userId, userId), eq(photos.contentHash, data.contentHash)))
        .limit(1);
      if (duplicate) {
        return {
          duplicatePhotoId: duplicate.id,
          error: "同じ写真が既にあります",
          success: false,
        } as const;
      }
      return { error: "写真を保存できませんでした", success: false } as const;
    }

    return { id: data.photoId, success: true } as const;
  });

const getPhotoInput = z.object({
  albumSlug: z.string().min(1).nullable().optional(),
  id: z.string().min(1),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const getPhoto = createServerFn({ method: "GET" })
  .validator(getPhotoInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    // 生の EXIF はクライアントに渡す必要がないため列を明示して除外する
    const [row] = await db
      .select({
        alt: photos.alt,
        altitude: photos.altitude,
        aperture: photos.aperture,
        cameraMake: photos.cameraMake,
        cameraModel: photos.cameraModel,
        caption: photos.caption,
        fileSize: photos.fileSize,
        focalLength: photos.focalLength,
        height: photos.height,
        id: photos.id,
        iso: photos.iso,
        latitude: photos.latitude,
        lensModel: photos.lensModel,
        longitude: photos.longitude,
        mimeType: photos.mimeType,
        shutterSpeed: photos.shutterSpeed,
        storageKey: photos.storageKey,
        takenAt: photos.takenAt,
        uploadedAt: photos.uploadedAt,
        width: photos.width,
      })
      .from(photos)
      .where(and(eq(photos.id, data.id), eq(photos.userId, userId)))
      .limit(1);
    if (!row) {
      return { error: "写真が見つかりません", success: false } as const;
    }
    // 全件を取得して JS で探すのを避けるため LAG/LEAD で前後 1 件だけを求める
    const sortDirection = data.order === "asc" ? sql`ASC` : sql`DESC`;
    // 一覧の並び順と揃えるため同着の第 3 キーはアルバム内では追加順にする
    const tieBreaker = data.albumSlug ? sql`ap.added_at` : sql`p.uploaded_at`;
    const ordering = sql`ORDER BY p.taken_at IS NULL, p.taken_at ${sortDirection}, ${tieBreaker} ${sortDirection}`;
    const source = data.albumSlug
      ? sql`FROM album_photos ap
          JOIN photos p ON p.id = ap.photo_id
          JOIN albums a ON a.id = ap.album_id
          WHERE a.slug = ${data.albumSlug} AND a.user_id = ${userId}`
      : sql`FROM photos p WHERE p.user_id = ${userId}`;
    const [albumRows, neighborRows] = await Promise.all([
      db
        .select({
          coverPhotoId: albums.coverPhotoId,
          id: albums.id,
          slug: albums.slug,
          title: albums.title,
          visibility: albums.visibility,
        })
        .from(albumPhotos)
        .innerJoin(albums, eq(albumPhotos.albumId, albums.id))
        .where(and(eq(albumPhotos.photoId, data.id), eq(albums.userId, userId)))
        .orderBy(albums.createdAt),
      db.all<{ next_id: string | null; previous_id: string | null }>(sql`
        WITH ordered AS (
          SELECT p.id AS id,
            LAG(p.id) OVER (${ordering}) AS previous_id,
            LEAD(p.id) OVER (${ordering}) AS next_id
          ${source}
        )
        SELECT previous_id, next_id FROM ordered WHERE id = ${data.id}
      `),
    ]);
    const [neighbor] = neighborRows;
    return {
      nextId: neighbor?.next_id ?? null,
      photo: { ...row, albums: albumRows },
      previousId: neighbor?.previous_id ?? null,
      success: true,
    } as const;
  });

export const missingLocation = or(isNull(photos.latitude), isNull(photos.longitude));

export const listPhotosMissingLocation = createServerFn({ method: "GET" })
  .validator(z.object({ limit: z.number().int().positive().max(1000).optional() }))
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const rows = await db
      .select({
        alt: photos.alt,
        caption: photos.caption,
        id: photos.id,
        storageKey: photos.storageKey,
        takenAt: photos.takenAt,
      })
      .from(photos)
      .where(and(eq(photos.userId, userId), missingLocation))
      .orderBy(desc(photos.takenAt))
      .limit(data.limit ?? 1000);
    return {
      photos: rows.map((row) => ({
        alt: row.alt,
        caption: row.caption,
        id: row.id,
        storageKey: row.storageKey,
        takenAt: row.takenAt?.toISOString() ?? null,
      })),
      success: true,
    } as const;
  });

const locationItemSchema = z.object({
  id: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const applyPhotoLocationsInput = z.object({
  items: z.array(locationItemSchema).min(1).max(100),
});

export const applyPhotoLocations = createServerFn({ method: "POST" })
  .validator(applyPhotoLocationsInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const [first, ...rest] = data.items.map((item) => {
      const condition = and(eq(photos.id, item.id), eq(photos.userId, userId), missingLocation);
      return db
        .update(photos)
        .set({ latitude: item.latitude, longitude: item.longitude })
        .where(condition)
        .returning({ id: photos.id });
    });
    const results = await db.batch([first, ...rest]);
    return { success: true, updated: results.flat().length } as const;
  });

const draftItemSchema = z.object({
  alt: z.string().max(500).nullable(),
  caption: z.string().max(2000).nullable(),
  id: z.string().min(1),
});

const updatePhotosInput = z.object({
  items: z.array(draftItemSchema).min(1).max(100),
});

export const updatePhotos = createServerFn({ method: "POST" })
  .validator(updatePhotosInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const [first, ...rest] = data.items.map((item) =>
      db
        .update(photos)
        .set({ alt: item.alt, caption: item.caption })
        .where(and(eq(photos.id, item.id), eq(photos.userId, userId)))
        .returning({ id: photos.id }),
    );
    const results = await db.batch([first, ...rest]);
    return { success: true, updated: results.flat().length } as const;
  });

const updatePhotoLocationInput = z
  .object({
    id: z.string().min(1),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: "緯度と経度は両方を指定してください",
  });

export const updatePhotoLocation = createServerFn({ method: "POST" })
  .validator(updatePhotoLocationInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const updated = await db
      .update(photos)
      .set(
        data.latitude === null
          ? { altitude: null, latitude: null, longitude: null }
          : { latitude: data.latitude, longitude: data.longitude },
      )
      .where(and(eq(photos.id, data.id), eq(photos.userId, userId)))
      .returning({ id: photos.id });
    if (updated.length === 0) {
      return { error: "写真が見つかりません", success: false } as const;
    }
    return { id: data.id, success: true } as const;
  });

export const deleteOwnedPhotos = createServerOnlyFn(async (userId: string, photoIds: string[]) => {
  if (photoIds.length === 0) {
    return 0;
  }
  const db = drizzle(env.DB, { schema });
  const rows: { storageKey: string }[] = [];
  for (let offset = 0; offset < photoIds.length; offset += ID_CHUNK_SIZE) {
    // D1 のバインドパラメータ上限を超えないよう ID を分割して削除する
    const chunk = photoIds.slice(offset, offset + ID_CHUNK_SIZE);
    const deleted = await db
      .delete(photos)
      .where(and(eq(photos.userId, userId), inArray(photos.id, chunk)))
      .returning({ storageKey: photos.storageKey });
    rows.push(...deleted);
  }

  const storageKeys = rows.map((row) => row.storageKey);
  for (let offset = 0; offset < storageKeys.length; offset += R2_DELETE_CHUNK_SIZE) {
    // R2 の一括削除は 1 回あたり 1000 キーまでのため分割する
    const chunk = storageKeys.slice(offset, offset + R2_DELETE_CHUNK_SIZE);
    try {
      await env.MY_BUCKET.delete(chunk);
    } catch (error) {
      console.error("deleteOwnedPhotos: R2 のオブジェクト削除に失敗しました", chunk, error);
    }
  }
  return rows.length;
});

const deletePhotosInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const deletePhotos = createServerFn({ method: "POST" })
  .validator(deletePhotosInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const deleted = await deleteOwnedPhotos(userId, data.ids);
    if (deleted === 0) {
      return { error: "削除できる写真がありません", success: false } as const;
    }
    return { deleted, success: true } as const;
  });
