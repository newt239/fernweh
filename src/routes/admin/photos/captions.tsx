import { Stack, Text, Title } from "@mantine/core";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { PhotoDraftQueue } from "#/components/organisms/PhotoDraftQueue/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { listMyPhotos } from "#/server/photo-list.ts";

const PhotoCaptionsPage = () => {
  const { photos, total } = Route.useLoaderData();
  const { field } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>説明を生成する</Title>
      <Text size="sm" c="dimmed">
        キャプションか代替テキストが未入力の写真をまとめて生成して保存できます。
      </Text>

      <PhotoDraftQueue
        key={`${field}-${total}-${photos[0]?.id ?? ""}`}
        photos={photos}
        total={total}
        field={field}
        onFieldChange={(next) => {
          navigate({ replace: true, search: { field: next } });
        }}
      />
    </Stack>
  );
};

const searchSchema = z.object({
  field: z.enum(["caption", "alt"]).default("caption"),
});

const loaderDeps = ({ search }: { search: z.infer<typeof searchSchema> }) => ({
  field: search.field,
});

export const Route = createFileRoute("/admin/photos/captions")({
  component: PhotoCaptionsPage,
  head: () => ({ meta: [{ title: `説明を生成 | ${APP_NAME}` }] }),
  loader: async ({ deps }: { deps: ReturnType<typeof loaderDeps> }) => {
    const result = await listMyPhotos({ data: { limit: 50, missing: deps.field } });
    if (!result.success) {
      throw notFound();
    }
    return {
      photos: result.photos.map((p) => ({
        alt: p.alt,
        caption: p.caption,
        id: p.id,
        storageKey: p.storageKey,
      })),
      total: result.total,
    };
  },
  loaderDeps,
  validateSearch: searchSchema,
});
