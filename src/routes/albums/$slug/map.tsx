import { useMemo } from "react";

import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import leafletCss from "leaflet/dist/leaflet.css?url";

import { Notice } from "#/components/atoms/Notice/index.tsx";
import { PhotoMap } from "#/components/organisms/PhotoMap/index.tsx";

const PublicAlbumMapPage = () => {
  const { photos } = useLoaderData({ from: "/albums/$slug" });
  // 参照が変わるたび Leaflet の地図が作り直されるため配列を安定させる
  const geotagged = useMemo(
    () =>
      photos.flatMap((p) =>
        p.latitude === null || p.longitude === null
          ? []
          : [{ ...p, latitude: p.latitude, longitude: p.longitude }],
      ),
    [photos],
  );

  if (geotagged.length === 0) {
    return <Notice>位置情報のある写真がありません</Notice>;
  }
  return <PhotoMap photos={geotagged} />;
};

export const Route = createFileRoute("/albums/$slug/map")({
  component: PublicAlbumMapPage,
  head: () => ({
    links: [{ href: leafletCss, rel: "stylesheet" }],
  }),
});
