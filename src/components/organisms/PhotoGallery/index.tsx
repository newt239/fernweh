import { useEffect, useMemo, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";
import { LayoutGridIcon, Share2Icon } from "lucide-react";
import { thumbHashToDataURL } from "thumbhash";

import { PhotoLightbox } from "#/components/organisms/PhotoLightbox/index.tsx";
import { photoImageUrl, photoSrcSet } from "#/lib/image-url.ts";
import { masonryStyle } from "#/lib/masonry.ts";

import classes from "./PhotoGallery.module.css";

const EAGER_COUNT = 6;

type PhotoGalleryItem = {
  id: string;
  caption: string | null;
  alt: string | null;
  placeholder: string | null;
  storageKey: string;
  width: number;
  height: number;
};

export const PhotoGallery = ({
  photos,
  size,
}: {
  photos: PhotoGalleryItem[];
  size: number | undefined;
}) => {
  const [index, setIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // アンマウント後に setCopied が走らないようタイマーを片付ける
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );
  // 列数は size があればそれに固定し、無ければ CSS のコンテナクエリが 1〜3 列から選ぶ
  const positions =
    (size === undefined ? "" : `.${classes.canvas}{--cols:${size};}`) +
    masonryStyle(photos, size === undefined ? [1, 2, 3] : [size], {
      canvas: classes.canvas,
      item: classes.item,
    });
  const blurs = useMemo(
    () =>
      photos.map((p) =>
        p.placeholder
          ? thumbHashToDataURL(Uint8Array.from(atob(p.placeholder), (c) => c.codePointAt(0) ?? 0))
          : null,
      ),
    [photos],
  );

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.share({ title: document.title, url });
      return;
    } catch (error) {
      // 共有シートのキャンセルは正常系なので何もせず終える
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
    // 共有 API が使えない環境ではクリップボードにコピーする
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (copiedTimer.current !== null) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className={classes.page}>
        <div className={`${classes.gallery} ${size === undefined ? classes.auto : ""}`}>
          <style>{positions}</style>
          <div className={classes.canvas}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={classes.item}
                data-index={i}
                onClick={() => setIndex(i)}
                aria-label={p.alt ?? p.caption ?? "写真を拡大する"}
              >
                <img
                  src={photoImageUrl(p.storageKey, 1024)}
                  srcSet={photoSrcSet(p.storageKey, [320, 640, 1024], p.width)}
                  sizes={
                    size === undefined
                      ? "(max-width: 239px) 100vw, (max-width: 480px) 50vw, 33vw"
                      : `calc(100vw / ${size})`
                  }
                  alt=""
                  loading={i < EAGER_COUNT ? "eager" : "lazy"}
                  fetchPriority={i < EAGER_COUNT ? "high" : undefined}
                  decoding="async"
                  style={{
                    aspectRatio: `${p.width} / ${p.height}`,
                    backgroundImage: blurs[i] ? `url(${blurs[i]})` : undefined,
                    backgroundSize: "cover",
                  }}
                />
                {p.caption && <span className={classes.caption}>{p.caption}</span>}
              </button>
            ))}
          </div>
        </div>
        <nav className={classes.footer}>
          <Link className={classes.footerLink} to="/">
            <LayoutGridIcon size={14} />
            アルバム一覧を見る
          </Link>
          <button type="button" className={classes.footerLink} onClick={handleShare}>
            <Share2Icon size={14} />
            <span role="status">{copied ? "URL をコピーしました" : "このページをシェアする"}</span>
          </button>
        </nav>
      </div>
      <PhotoLightbox
        photos={photos}
        index={index}
        onClose={() => setIndex(null)}
        onIndexChange={setIndex}
      />
    </>
  );
};
