import { useEffect, useRef, useState } from "react";

import { thumbHashToDataURL } from "thumbhash";

import { PhotoLightbox } from "#/components/organisms/PhotoLightbox/index.tsx";
import { photoImageUrl } from "#/lib/image-url.ts";
import { DEFAULT_CENTER, DEFAULT_ZOOM, addOsmTileLayer, loadLeaflet } from "#/lib/leaflet.ts";

import classes from "./PhotoMap.module.css";

import type * as Leaflet from "leaflet";

type PhotoMapItem = {
  id: string;
  caption: string | null;
  alt: string | null;
  placeholder: string | null;
  storageKey: string;
  latitude: number;
  longitude: number;
  width: number;
  height: number;
};

export const PhotoMap = ({ photos }: { photos: PhotoMapItem[] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState<number | null>(null);

  // Leaflet は window に依存し SSR では読み込めないため、マウント後に動的 import して地図を生成する
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    // 全ピンを一度に読み込むと画像の変換が集中するため、地図に映った分だけ後から読み込む
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pin = entry.target;
          if (!entry.isIntersecting || !(pin instanceof HTMLImageElement)) {
            continue;
          }
          const source = pin.dataset.src;
          if (source) {
            pin.src = source;
            delete pin.dataset.src;
          }
          observer.unobserve(pin);
        }
      },
      { root: containerRef.current, rootMargin: "128px" },
    );
    loadLeaflet().then((leaflet) => {
      const container = containerRef.current;
      if (cancelled || !container) {
        return;
      }
      map = new leaflet.Map(container).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      addOsmTileLayer(leaflet, map);

      for (const [position, photo] of photos.entries()) {
        const pin = document.createElement("img");
        pin.dataset.src = photoImageUrl(photo.storageKey, 320);
        pin.alt = "";
        if (photo.placeholder) {
          const bytes = Uint8Array.from(atob(photo.placeholder), (c) => c.codePointAt(0) ?? 0);
          pin.style.backgroundImage = `url(${thumbHashToDataURL(bytes)})`;
        }
        observer.observe(pin);
        const marker = leaflet
          .marker([photo.latitude, photo.longitude], {
            alt: photo.alt ?? photo.caption ?? "",
            icon: leaflet.divIcon({
              className: classes.pin,
              html: pin,
              iconAnchor: [24, 24],
              iconSize: [48, 48],
            }),
          })
          .addTo(map);
        if (photo.caption) {
          const tooltip = document.createElement("span");
          tooltip.textContent = photo.caption;
          marker.bindTooltip(tooltip);
        }
        marker.on("click", () => setIndex(position));
      }

      map.fitBounds(
        leaflet.latLngBounds(photos.map((photo) => [photo.latitude, photo.longitude])),
        { maxZoom: 14, padding: [64, 64] },
      );
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      map?.remove();
    };
  }, [photos]);

  return (
    <>
      <div ref={containerRef} className={classes.map} />
      <PhotoLightbox
        photos={photos}
        index={index}
        onClose={() => setIndex(null)}
        onIndexChange={setIndex}
      />
    </>
  );
};
