import { useState } from "react";

import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react";

import { AlbumCover } from "#/components/organisms/AlbumCover/index.tsx";
import { AlbumForm, type AlbumFormValues } from "#/components/organisms/AlbumForm/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { deleteAlbum, getAlbumBySlug, updateAlbum } from "#/server/albums.ts";

const AlbumSettingsPage = () => {
  const { album, photoCount } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deletePhotos, setDeletePhotos] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) {
      return;
    }
    setDeleting(true);
    setErrorMessage(null);
    try {
      const result = await deleteAlbum({ data: { deletePhotos, id: album.id } });
      if (result.success) {
        await router.navigate({ to: "/admin/albums" });
        await router.invalidate();
      } else {
        setErrorMessage(result.error);
        closeDelete();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      closeDelete();
    }
    setDeleting(false);
  };

  const handleSubmit = async (values: AlbumFormValues) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    setSaved(false);
    try {
      const result = await updateAlbum({
        data: {
          id: album.id,
          periodEnd: values.periodEnd || null,
          periodStart: values.periodStart || null,
          slug: values.slug,
          title: values.title,
          visibility: values.visibility,
        },
      });
      if (result.success) {
        if (result.slug !== slug) {
          await router.navigate({
            params: { slug: result.slug },
            replace: true,
            to: "/admin/albums/$slug/settings",
          });
        }
        await router.invalidate();
        setSaved(true);
      } else {
        setErrorMessage(result.error);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
    setSubmitting(false);
  };

  return (
    <Stack p="xl" gap="md">
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="アルバムに戻る"
          renderRoot={(props) => <Link {...props} to="/admin/albums/$slug" params={{ slug }} />}
        >
          <ArrowLeftIcon size={18} />
        </ActionIcon>
        <Title order={2}>アルバムの設定</Title>
      </Group>

      <AlbumForm
        key={album.slug}
        initialValues={{
          periodEnd: album.periodEnd ?? "",
          periodStart: album.periodStart ?? "",
          slug: album.slug,
          title: album.title,
          visibility: album.visibility,
        }}
        slugRequired
        slugDescription="公開ページのアドレスに使われます。英数字・ひらがな・カタカナ・漢字とハイフンが使えます"
        requireDirty
        submitLabel="保存する"
        submitIcon={<SaveIcon size={16} />}
        submitting={submitting}
        errorMessage={errorMessage}
        statusMessage={saved ? "保存しました" : undefined}
        onSubmit={(values) => {
          handleSubmit(values);
        }}
      />

      <Divider my="sm" />

      <Stack gap="xs">
        <Title order={3} size="h5">
          カバー画像
        </Title>
        <AlbumCover albumId={album.id} selected={album.coverPhotoId !== null} photo={album.cover} />
      </Stack>

      <Divider my="sm" />

      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            アルバムの削除
          </Text>
          <Text size="xs" c="dimmed">
            削除したアルバムは元に戻せません
          </Text>
        </Stack>
        <Button
          color="red"
          variant="outline"
          leftSection={<Trash2Icon size={16} />}
          onClick={openDelete}
        >
          アルバムを削除する
        </Button>
      </Group>

      <Modal opened={deleteOpened} onClose={closeDelete} title="アルバムを削除する" centered>
        <Stack gap="md">
          <Text size="sm">「{album.title}」を削除します。この操作は取り消せません。</Text>
          <Checkbox
            label={`アルバム内の写真 ${photoCount} 枚も削除する`}
            description="削除した写真は他のアルバムからも取り除かれます。チェックしない場合、写真はアルバムから外れるだけで残ります"
            checked={deletePhotos}
            disabled={photoCount === 0 || deleting}
            onChange={(e) => setDeletePhotos(e.currentTarget.checked)}
          />
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              leftSection={<XIcon size={16} />}
              onClick={closeDelete}
              disabled={deleting}
            >
              キャンセルする
            </Button>
            <Button
              color="red"
              leftSection={<Trash2Icon size={16} />}
              loading={deleting}
              onClick={() => handleDelete()}
            >
              削除する
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export const Route = createFileRoute("/admin/albums_/$slug/settings")({
  component: AlbumSettingsPage,
  head: ({ loaderData }) => ({
    meta: [{ title: `設定 | ${loaderData?.album.title ?? "アルバム"} | ${APP_NAME}` }],
  }),
  loader: async ({ params }: { params: { slug: string } }) => {
    const result = await getAlbumBySlug({ data: { slug: params.slug } });
    if (!result.success) {
      throw notFound();
    }
    const { album, photos } = result;
    return {
      album: {
        cover: album.coverStorageKey ? { storageKey: album.coverStorageKey } : null,
        coverPhotoId: album.coverPhotoId,
        id: album.id,
        periodEnd: album.periodEnd,
        periodStart: album.periodStart,
        slug: album.slug,
        title: album.title,
        visibility: album.visibility,
      },
      photoCount: photos.length,
    };
  },
  shouldReload: true,
});
