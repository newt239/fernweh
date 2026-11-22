import { useMemo } from "react";

import { Link } from "@tanstack/react-router";
import { thumbHashToDataURL } from "thumbhash";

import { formatAlbumPeriod } from "#/lib/format.ts";
import { photoImageUrl, photoSrcSet } from "#/lib/image-url.ts";
import { masonryStyle } from "#/lib/masonry.ts";

import classes from "./AlbumMasonry.module.css";

import type { listPublicAlbums } from "#/server/public.ts";

type AlbumMasonryItem = Awaited<ReturnType<typeof listPublicAlbums>>[number];

const EAGER_COUNT = 4;

export const AlbumMasonry = ({ albums }: { albums: AlbumMasonryItem[] }) => {
  // カバーが無いアルバムはプレースホルダーと同じ 4:3 として積む
  const sized = albums.map((album) => ({
    ...album,
    height: album.coverHeight ?? 3,
    width: album.coverWidth ?? 4,
  }));
  const positions = masonryStyle(sized, [1, 2, 3, 4], {
    canvas: classes.canvas,
    item: classes.item,
  });
  const blurs = useMemo(() => {
    const urls = new Map<string, string>();
    for (const album of albums) {
      if (album.coverPlaceholder) {
        const bytes = Uint8Array.from(atob(album.coverPlaceholder), (c) => c.codePointAt(0) ?? 0);
        urls.set(album.id, thumbHashToDataURL(bytes));
      }
    }
    return urls;
  }, [albums]);

  return (
    <div className={classes.gallery}>
      <style>{positions}</style>
      <div className={classes.canvas}>
        {sized.map((album, index) => {
          const coverKey = album.coverStorageKey;
          const blur = blurs.get(album.id);
          const period = formatAlbumPeriod(album.periodStart, album.periodEnd);
          return (
            <Link
              key={album.id}
              to="/albums/$slug"
              params={{ slug: album.slug }}
              className={classes.item}
              data-index={index}
            >
              {coverKey ? (
                <img
                  src={photoImageUrl(coverKey, 640)}
                  srcSet={photoSrcSet(coverKey, [640, 1024])}
                  sizes="(min-width: 1408px) 25vw, (min-width: 1056px) 33vw, (min-width: 704px) 50vw, 100vw"
                  alt=""
                  loading={index < EAGER_COUNT ? "eager" : "lazy"}
                  fetchPriority={index < EAGER_COUNT ? "high" : undefined}
                  decoding="async"
                  style={{
                    aspectRatio: `${album.width} / ${album.height}`,
                    backgroundImage: blur ? `url(${blur})` : undefined,
                    backgroundSize: "cover",
                  }}
                />
              ) : (
                <div className={classes.placeholder} />
              )}
              <span className={classes.caption}>
                <span className={classes.title}>{album.title}</span>
                {period ? <span className={classes.description}>{period}</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
