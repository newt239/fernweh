import {
  Outlet,
  createFileRoute,
  notFound,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import * as z from "zod";

import { AlbumViewerControls } from "#/components/organisms/AlbumViewerControls/index.tsx";
import { env } from "#/env.ts";
import { APP_NAME } from "#/lib/app.ts";
import { formatAlbumPeriod } from "#/lib/format.ts";
import { getPublicAlbumBySlug } from "#/server/public.ts";

const PublicAlbumLayout = () => {
  const { album, photos } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { size } = Route.useSearch();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const mode = matchRoute({ params: { slug }, to: "/albums/$slug/map" }) ? "map" : "photo";

  return (
    <>
      <main>
        <Outlet />
      </main>
      <AlbumViewerControls
        title={album.title}
        period={formatAlbumPeriod(album.periodStart, album.periodEnd)}
        hasGeotagged={photos.some((p) => p.latitude !== null && p.longitude !== null)}
        mode={mode}
        size={size}
        onModeChange={(next) => {
          navigate({
            params: { slug },
            search: (prev) => prev,
            to: next === "map" ? "/albums/$slug/map" : "/albums/$slug",
          });
        }}
        onSizeChange={(next) => {
          navigate({
            params: { slug },
            replace: true,
            search: (prev) => ({ ...prev, size: next }),
            to: "/albums/$slug",
          });
        }}
      />
    </>
  );
};

export const Route = createFileRoute("/albums/$slug")({
  component: PublicAlbumLayout,
  head: ({ loaderData, params }) => {
    const title = loaderData?.album.title ?? "アルバム";
    const period = loaderData
      ? formatAlbumPeriod(loaderData.album.periodStart, loaderData.album.periodEnd)
      : null;
    const description = period ? `${period}に撮影した写真` : null;
    const url = `${env.VITE_SITE_URL}/albums/${encodeURIComponent(params.slug)}`;
    const version = loaderData ? new Date(loaderData.album.updatedAt).getTime() : 0;
    return {
      meta: [
        { title: `${title} | ${APP_NAME}` },
        { content: title, property: "og:title" },
        { content: url, property: "og:url" },
        {
          content: `${env.VITE_SITE_URL}/api/og/albums/${encodeURIComponent(params.slug)}?v=${version}`,
          property: "og:image",
        },
        ...(description
          ? [
              { content: description, name: "description" },
              { content: description, property: "og:description" },
            ]
          : []),
      ],
    };
  },
  loader: async ({ params }: { params: { slug: string } }) => {
    const result = await getPublicAlbumBySlug({ data: { slug: params.slug } });
    if (!result) {
      throw notFound();
    }
    return result;
  },
  validateSearch: z.object({ size: z.number().int().min(1).max(12).optional() }),
});
