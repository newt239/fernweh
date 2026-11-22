import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as z from "zod";

import * as schema from "#/db/schema.ts";
import { albumPhotos, albums, photos } from "#/db/schema.ts";

export const coverPhotoId = sql`(
    SELECT COALESCE(
      ${albums}.cover_photo_id,
      (SELECT ap.photo_id FROM album_photos ap
        WHERE ap.album_id = ${albums}.id
        ORDER BY ap.added_at ASC
        LIMIT 1)
    )
  )`;

const oldestTakenAt = sql`(
    SELECT MIN(p.taken_at) FROM album_photos ap
      JOIN photos p ON p.id = ap.photo_id
      WHERE ap.album_id = ${albums}.id
  )`;

export const albumListOrder = [
  sql`${albums}.period_start IS NULL`,
  desc(albums.periodStart),
  desc(oldestTakenAt),
  desc(albums.createdAt),
];

export const listPublicAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const db = drizzle(env.DB, { schema });
  const rows = await db
    .select({
      coverHeight: photos.height,
      coverPlaceholder: photos.placeholder,
      coverStorageKey: photos.storageKey,
      coverWidth: photos.width,
      id: albums.id,
      periodEnd: albums.periodEnd,
      periodStart: albums.periodStart,
      slug: albums.slug,
      title: albums.title,
    })
    .from(albums)
    .leftJoin(photos, eq(photos.id, coverPhotoId))
    .where(eq(albums.visibility, "public"))
    .orderBy(...albumListOrder);
  return rows;
});

export const getPublicAlbumBySlug = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = drizzle(env.DB, { schema });
    const [album] = await db
      .select({
        id: albums.id,
        periodEnd: albums.periodEnd,
        periodStart: albums.periodStart,
        title: albums.title,
        updatedAt: albums.updatedAt,
      })
      .from(albums)
      .where(and(eq(albums.slug, data.slug), eq(albums.visibility, "public")))
      .limit(1);
    if (!album) {
      return null;
    }

    const photoRows = await db
      .select({
        alt: photos.alt,
        caption: photos.caption,
        height: photos.height,
        id: photos.id,
        latitude: photos.latitude,
        longitude: photos.longitude,
        placeholder: photos.placeholder,
        storageKey: photos.storageKey,
        width: photos.width,
      })
      .from(albumPhotos)
      .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
      .where(eq(albumPhotos.albumId, album.id))
      .orderBy(sql`${photos}.taken_at IS NULL`, asc(photos.takenAt), asc(albumPhotos.addedAt));

    return {
      album: {
        periodEnd: album.periodEnd,
        periodStart: album.periodStart,
        title: album.title,
        updatedAt: album.updatedAt,
      },
      photos: photoRows,
    };
  });
