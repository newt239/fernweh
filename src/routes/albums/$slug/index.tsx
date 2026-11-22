import { createFileRoute, useLoaderData, useSearch } from "@tanstack/react-router";

import { Notice } from "#/components/atoms/Notice/index.tsx";
import { PhotoGallery } from "#/components/organisms/PhotoGallery/index.tsx";

const PublicAlbumIndexPage = () => {
  const { photos } = useLoaderData({ from: "/albums/$slug" });
  const { size } = useSearch({ from: "/albums/$slug" });

  if (photos.length === 0) {
    return <Notice>このアルバムにはまだ写真がありません</Notice>;
  }
  return <PhotoGallery photos={photos} size={size} />;
};

export const Route = createFileRoute("/albums/$slug/")({
  component: PublicAlbumIndexPage,
});
