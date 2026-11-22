import { createFileRoute } from "@tanstack/react-router";

import { Notice } from "#/components/atoms/Notice/index.tsx";
import { AlbumMasonry } from "#/components/organisms/AlbumMasonry/index.tsx";
import { env } from "#/env.ts";
import { listPublicAlbums } from "#/server/public.ts";

const IndexPage = () => {
  const { albums } = Route.useLoaderData();
  return (
    <main>
      {albums.length === 0 ? (
        <Notice>公開アルバムはまだありません</Notice>
      ) : (
        <AlbumMasonry albums={albums} />
      )}
    </main>
  );
};

export const Route = createFileRoute("/")({
  component: IndexPage,
  head: () => ({
    meta: [{ content: env.VITE_SITE_URL, property: "og:url" }],
  }),
  loader: async () => ({
    albums: await listPublicAlbums(),
  }),
});
