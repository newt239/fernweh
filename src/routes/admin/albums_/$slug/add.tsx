import { useState } from "react";

import { Button, Group, Paper, Stack, Tabs, Text, Title } from "@mantine/core";
import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";

import { PhotoPicker } from "#/components/molecules/PhotoPicker/index.tsx";
import { UploadDropzone } from "#/components/organisms/UploadDropzone/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { addPhotosToAlbum, getAlbumBySlug } from "#/server/albums.ts";
import { listMyPhotos } from "#/server/photo-list.ts";

const AlbumAddPhotosPage = () => {
  const { album, existingPhotoIds, photos } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const router = useRouter();
  const [selected, setSelected] = useState(new Set<string>());
  const [submitting, setSubmitting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alreadyAdded = new Set(existingPhotoIds);

  const handleUploaded = async (photoIds: string[]) => {
    if (photoIds.length === 0) {
      return;
    }
    setError(null);
    setUploadMessage(null);
    const result = await addPhotosToAlbum({ data: { albumId: album.id, photoIds } });
    if (result.success) {
      setUploadMessage(`${result.inserted} 枚をアルバムに追加しました`);
      await router.invalidate();
    } else {
      setError(result.error);
    }
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await addPhotosToAlbum({
        data: { albumId: album.id, photoIds: [...selected] },
      });
      if (result.success) {
        await router.navigate({ params: { slug }, to: "/admin/albums/$slug" });
      } else {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack p="xl" gap="md">
      <Button
        variant="subtle"
        size="xs"
        w="fit-content"
        leftSection={<ArrowLeftIcon size={14} />}
        renderRoot={(props) => <Link {...props} to="/admin/albums/$slug" params={{ slug }} />}
      >
        アルバムに戻る
      </Button>
      <Stack gap={4}>
        <Title order={2}>写真を追加する</Title>
        <Text size="sm" c="dimmed">
          {album.title}
        </Text>
      </Stack>

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}

      <Tabs defaultValue="upload">
        <Tabs.List>
          <Tabs.Tab value="upload">アップロード</Tabs.Tab>
          <Tabs.Tab value="library">ライブラリから選ぶ</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="upload" pt="md">
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              ここでアップロードした写真はそのままこのアルバムに追加されます。
            </Text>
            <Paper withBorder radius="md" p="lg">
              <UploadDropzone
                onComplete={(photoIds) => {
                  handleUploaded(photoIds);
                }}
              />
            </Paper>
            {uploadMessage && (
              <Text size="sm" c="dimmed">
                {uploadMessage}
              </Text>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="library" pt="md">
          {photos.length === 0 ? (
            <Text c="dimmed" size="sm">
              追加できる写真がありません
            </Text>
          ) : (
            <Stack gap="md">
              <PhotoPicker
                photos={photos}
                actionsId="album-add-photos"
                disabledPhotoIds={alreadyAdded}
                selectedPhotoIds={selected}
                onToggle={(photoId) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(photoId)) {
                      next.delete(photoId);
                    } else {
                      next.add(photoId);
                    }
                    return next;
                  });
                }}
              />
              <Group justify="flex-end">
                <Button
                  id="album-add-photos"
                  leftSection={<PlusIcon size={16} />}
                  onClick={() => {
                    handleSubmit();
                  }}
                  loading={submitting}
                  disabled={selected.size === 0}
                >
                  {selected.size > 0 ? `${selected.size} 枚を追加する` : "追加する"}
                </Button>
              </Group>
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

export const Route = createFileRoute("/admin/albums_/$slug/add")({
  component: AlbumAddPhotosPage,
  head: ({ loaderData }) => ({
    meta: [{ title: `写真を追加 | ${loaderData?.album.title ?? "アルバム"} | ${APP_NAME}` }],
  }),
  loader: async ({ params }: { params: { slug: string } }) => {
    const [detail, myPhotos] = await Promise.all([
      getAlbumBySlug({ data: { slug: params.slug } }),
      listMyPhotos({ data: { limit: 200 } }),
    ]);
    if (!detail.success || !myPhotos.success) {
      throw notFound();
    }
    return {
      album: { id: detail.album.id, title: detail.album.title },
      existingPhotoIds: detail.photos.map((p) => p.id),
      photos: myPhotos.photos.map((p) => ({
        caption: p.caption,
        id: p.id,
        storageKey: p.storageKey,
      })),
    };
  },
});
