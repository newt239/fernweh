import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray, like, sql, type SQL } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import * as z from "zod";

import * as schema from "#/db/schema.ts";
import { albumPhotos, albums, photos } from "#/db/schema.ts";
import { photoCardColumns, toPhotoCard } from "#/server/photo-list.ts";
import { deleteOwnedPhotos } from "#/server/photos.ts";
import { albumListOrder, coverPhotoId } from "#/server/public.ts";
import { getCurrentUserId } from "#/server/user.ts";

const SLUG_PATTERN = /^[a-zA-Z0-9぀-ゟ゠-ヿ一-鿿-]+$/;

const ID_CHUNK_SIZE = 90;

const INSERT_CHUNK_SIZE = 45;

const findOwnedAlbum = async (
  db: DrizzleD1Database<typeof schema>,
  albumId: string,
  userId: string,
) => {
  const [album] = await db
    .select({ coverPhotoId: albums.coverPhotoId, id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  return album;
};

const albumPeriod = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
  .nullable();

const periodMessage = { message: "終了年月は開始年月以降にしてください" };

const createAlbumInput = z
  .object({
    periodEnd: albumPeriod.optional().default(null),
    periodStart: albumPeriod.optional().default(null),
    slug: z.string().max(200).nullable().optional(),
    title: z.string().min(1).max(200),
    visibility: z.enum(["public", "private"]).default("private"),
  })
  .refine(
    (value) =>
      value.periodEnd === null ||
      (value.periodStart !== null && value.periodStart <= value.periodEnd),
    periodMessage,
  );

export const createAlbum = createServerFn({ method: "POST" })
  .validator(createAlbumInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const id = nanoid();
    let slug = data.slug?.trim() ?? "";
    if (slug && !SLUG_PATTERN.test(slug)) {
      return { error: "URL に使えない文字が含まれています", success: false } as const;
    }
    if (!slug) {
      const normalized = data.title
        .normalize("NFKD")
        .replaceAll(/[\u0300-\u036F]/g, "")
        .toLowerCase()
        .replaceAll(/[^a-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");
      slug = `${normalized || "album"}-${nanoid(6)}`;
    }
    try {
      await db.insert(albums).values({
        id,
        periodEnd: data.periodEnd,
        periodStart: data.periodStart,
        slug,
        title: data.title,
        userId,
        visibility: data.visibility,
      });
    } catch {
      // 一意制約があるため slug が重複するとここに来る
      return { error: "この URL は既に使われています", success: false } as const;
    }
    return { id, slug, success: true } as const;
  });

const updateAlbumInput = z
  .object({
    id: z.string().min(1),
    periodEnd: albumPeriod,
    periodStart: albumPeriod,
    slug: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    visibility: z.enum(["public", "private"]),
  })
  .refine(
    (value) =>
      value.periodEnd === null ||
      (value.periodStart !== null && value.periodStart <= value.periodEnd),
    periodMessage,
  );

export const updateAlbum = createServerFn({ method: "POST" })
  .validator(updateAlbumInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });

    if (!SLUG_PATTERN.test(data.slug)) {
      return { error: "URL に使えない文字が含まれています", success: false } as const;
    }

    const album = await findOwnedAlbum(db, data.id, userId);
    if (!album) {
      return { error: "アルバムが見つかりません", success: false } as const;
    }

    try {
      await db
        .update(albums)
        .set({
          periodEnd: data.periodEnd,
          periodStart: data.periodStart,
          slug: data.slug,
          title: data.title,
          updatedAt: new Date(),
          visibility: data.visibility,
        })
        .where(eq(albums.id, data.id));
    } catch {
      // 一意制約があるため slug が重複するとここに来る
      return { error: "この URL は既に使われています", success: false } as const;
    }

    return { slug: data.slug, success: true } as const;
  });

export const listMyAlbums = createServerFn({ method: "GET" })
  .validator(
    z.object({
      limit: z.int().positive().max(200).optional(),
      q: z.string().max(100).optional(),
      year: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const conditions: SQL[] = [eq(albums.userId, userId)];
    if (data.q) {
      const pattern = `%${data.q.replaceAll(/[%_\\]/g, String.raw`\$&`)}%`;
      conditions.push(sql`${albums}.title LIKE ${pattern} ESCAPE '\'`);
    }
    if (data.year) {
      conditions.push(like(albums.periodStart, `${data.year}-%`));
    }
    const rows = await db
      .select({
        coverStorageKey: photos.storageKey,
        id: albums.id,
        periodEnd: albums.periodEnd,
        periodStart: albums.periodStart,
        slug: albums.slug,
        title: albums.title,
        visibility: albums.visibility,
      })
      .from(albums)
      .leftJoin(photos, eq(photos.id, coverPhotoId))
      .where(and(...conditions))
      .orderBy(...albumListOrder)
      .limit(data.limit ?? 200);
    return { albums: rows, success: true } as const;
  });

const getAlbumBySlugInput = z.object({
  order: z.enum(["asc", "desc"]).default("desc"),
  slug: z.string().min(1),
});

export const getAlbumBySlug = createServerFn({ method: "GET" })
  .validator(getAlbumBySlugInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const [album] = await db
      .select({
        coverPhotoId: albums.coverPhotoId,
        coverStorageKey: photos.storageKey,
        id: albums.id,
        periodEnd: albums.periodEnd,
        periodStart: albums.periodStart,
        slug: albums.slug,
        title: albums.title,
        visibility: albums.visibility,
      })
      .from(albums)
      .leftJoin(photos, eq(photos.id, coverPhotoId))
      .where(and(eq(albums.slug, data.slug), eq(albums.userId, userId)))
      .limit(1);
    if (!album) {
      return { error: "アルバムが見つかりません", success: false } as const;
    }

    const direction = data.order === "asc" ? asc : desc;
    const photoRows = await db
      .select(photoCardColumns)
      .from(albumPhotos)
      .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
      .where(eq(albumPhotos.albumId, album.id))
      .orderBy(
        sql`${photos}.taken_at IS NULL`,
        direction(photos.takenAt),
        direction(albumPhotos.addedAt),
      );

    return { album, photos: photoRows.map((row) => toPhotoCard(row)), success: true } as const;
  });

const setAlbumCoverInput = z.object({
  albumId: z.string().min(1),
  photoId: z.string().min(1).nullable(),
});

export const setAlbumCover = createServerFn({ method: "POST" })
  .validator(setAlbumCoverInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });

    const album = await findOwnedAlbum(db, data.albumId, userId);
    if (!album) {
      return { error: "アルバムが見つかりません", success: false } as const;
    }

    if (data.photoId) {
      const [member] = await db
        .select({ photoId: albumPhotos.photoId })
        .from(albumPhotos)
        .where(and(eq(albumPhotos.albumId, album.id), eq(albumPhotos.photoId, data.photoId)))
        .limit(1);
      if (!member) {
        return { error: "この写真はアルバムに含まれていません", success: false } as const;
      }
    }

    await db
      .update(albums)
      .set({ coverPhotoId: data.photoId, updatedAt: new Date() })
      .where(eq(albums.id, album.id));

    return { success: true } as const;
  });

const addPhotosInput = z.object({
  albumId: z.string().min(1),
  photoIds: z.array(z.string().min(1)).min(1).max(500),
});

export const addPhotosToAlbum = createServerFn({ method: "POST" })
  .validator(addPhotosInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });

    const album = await findOwnedAlbum(db, data.albumId, userId);
    if (!album) {
      return { error: "アルバムが見つかりません", success: false } as const;
    }

    const photoIds = [...new Set(data.photoIds)];

    let ownedCount = 0;
    for (let offset = 0; offset < photoIds.length; offset += ID_CHUNK_SIZE) {
      // D1 のバインドパラメータ上限を超えないよう ID を分割して問い合わせる
      const chunk = photoIds.slice(offset, offset + ID_CHUNK_SIZE);
      const owned = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.userId, userId), inArray(photos.id, chunk)));
      ownedCount += owned.length;
    }
    if (ownedCount !== photoIds.length) {
      return { error: "追加できない写真が含まれています", success: false } as const;
    }

    let inserted = 0;
    for (let offset = 0; offset < photoIds.length; offset += INSERT_CHUNK_SIZE) {
      const rows = photoIds
        .slice(offset, offset + INSERT_CHUNK_SIZE)
        .map((photoId) => ({ albumId: album.id, photoId }));
      // 1 行あたり 2 パラメータを使うため挿入はさらに小さく分割する
      const result = await db
        .insert(albumPhotos)
        .values(rows)
        .onConflictDoNothing()
        .returning({ photoId: albumPhotos.photoId });
      inserted += result.length;
    }

    await db.update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, album.id));

    return { inserted, success: true } as const;
  });

const removePhotosInput = z.object({
  albumId: z.string().min(1),
  photoIds: z.array(z.string().min(1)).min(1).max(500),
});

export const removePhotosFromAlbum = createServerFn({ method: "POST" })
  .validator(removePhotosInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });

    const album = await findOwnedAlbum(db, data.albumId, userId);
    if (!album) {
      return { error: "アルバムが見つかりません", success: false } as const;
    }

    let removed = 0;
    for (let offset = 0; offset < data.photoIds.length; offset += ID_CHUNK_SIZE) {
      // D1 のバインドパラメータ上限を超えないよう ID を分割して削除する
      const chunk = data.photoIds.slice(offset, offset + ID_CHUNK_SIZE);
      const result = await db
        .delete(albumPhotos)
        .where(and(eq(albumPhotos.albumId, album.id), inArray(albumPhotos.photoId, chunk)))
        .returning({ photoId: albumPhotos.photoId });
      removed += result.length;
    }

    const coverRemoved = album.coverPhotoId !== null && data.photoIds.includes(album.coverPhotoId);
    await db
      .update(albums)
      .set({ ...(coverRemoved && { coverPhotoId: null }), updatedAt: new Date() })
      .where(eq(albums.id, album.id));

    return { removed, success: true } as const;
  });

const deleteAlbumInput = z.object({
  deletePhotos: z.boolean(),
  id: z.string().min(1),
});

export const deleteAlbum = createServerFn({ method: "POST" })
  .validator(deleteAlbumInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });

    const album = await findOwnedAlbum(db, data.id, userId);
    if (!album) {
      return { error: "アルバムが見つかりません", success: false } as const;
    }

    let deletedPhotos = 0;
    if (data.deletePhotos) {
      const photoIds = await db
        .select({ id: albumPhotos.photoId })
        .from(albumPhotos)
        .where(eq(albumPhotos.albumId, album.id));
      deletedPhotos = await deleteOwnedPhotos(
        userId,
        photoIds.map((row) => row.id),
      );
    }

    // 外部キーが cascade のため album_photos の行も合わせて消える
    await db.delete(albums).where(eq(albums.id, album.id));

    return { deletedPhotos, success: true } as const;
  });
