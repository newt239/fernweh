import { createFileRoute, notFound } from "@tanstack/react-router";
import leafletCss from "leaflet/dist/leaflet.css?url";
import * as z from "zod";

import { PhotoDetailView } from "#/components/organisms/PhotoDetailView/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { getPhoto } from "#/server/photos.ts";

const AlbumPhotoDetailPage = () => {
  const { nextId, photo, previousId } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { order } = Route.useSearch();
  return (
    <PhotoDetailView
      key={photo.id}
      photo={photo}
      albumSlug={slug}
      order={order}
      previousId={previousId}
      nextId={nextId}
    />
  );
};

const searchSchema = z.object({
  order: z.enum(["asc", "desc"]).default("desc"),
});

const loaderDeps = ({ search }: { search: z.infer<typeof searchSchema> }) => ({
  order: search.order,
});

export const Route = createFileRoute("/admin/albums_/$slug/photos/$photoId")({
  component: AlbumPhotoDetailPage,
  head: ({ loaderData }) => ({
    links: [{ href: leafletCss, rel: "stylesheet" }],
    meta: [{ title: `${loaderData?.photo.caption ?? "写真"} | ${APP_NAME}` }],
  }),
  loader: async ({
    deps,
    params,
  }: {
    deps: ReturnType<typeof loaderDeps>;
    params: { slug: string; photoId: string };
  }) => {
    const result = await getPhoto({
      data: { albumSlug: params.slug, id: params.photoId, order: deps.order },
    });
    if (!result.success) {
      throw notFound();
    }
    return result;
  },
  loaderDeps,
  validateSearch: searchSchema,
});
