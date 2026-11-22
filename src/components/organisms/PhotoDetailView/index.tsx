import { useState, useTransition } from "react";

import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Group,
  Menu,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  ExpandIcon,
  ImageIcon,
  SaveIcon,
  SparklesIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";

import { VisibilityIcon } from "#/components/atoms/VisibilityIcon/index.tsx";
import { PhotoLocationEditor } from "#/components/organisms/PhotoLocationEditor/index.tsx";
import { formatBytes, formatDateTime } from "#/lib/format.ts";
import { photoImageUrl } from "#/lib/image-url.ts";
import { photoDetailLink } from "#/lib/photo-link.ts";
import { usePhotoZoom } from "#/lib/photo-zoom.ts";
import { setAlbumCover } from "#/server/albums.ts";
import { generatePhotoDraft } from "#/server/photo-draft.ts";
import { updatePhotos } from "#/server/photos.ts";

import classes from "./PhotoDetailView.module.css";

type PhotoDetailData = {
  id: string;
  caption: string | null;
  alt: string | null;
  storageKey: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  takenAt: Date | string | null;
  uploadedAt: Date | string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  albums: {
    id: string;
    slug: string;
    title: string;
    visibility: "public" | "private";
    coverPhotoId: string | null;
  }[];
};

type InfoRow = { label: string; value: string };

const renderInfoList = (rows: InfoRow[]) => (
  <Stack gap={6}>
    {rows.map((row) => (
      <Group key={row.label} justify="space-between" gap="md" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {row.label}
        </Text>
        <Text size="sm" ta="right">
          {row.value}
        </Text>
      </Group>
    ))}
  </Stack>
);

type Props = {
  photo: PhotoDetailData;
  albumSlug?: string;
  order: "asc" | "desc";
  previousId: string | null;
  nextId: string | null;
};

export const PhotoDetailView = ({ photo, albumSlug, order, previousId, nextId }: Props) => {
  const router = useRouter();
  const imageSrc = photoImageUrl(photo.storageKey, 2048);
  const camera = [photo.cameraMake, photo.cameraModel].filter(Boolean).join(" ");
  const exifRows: InfoRow[] = [];
  if (camera) {
    exifRows.push({ label: "カメラ", value: camera });
  }
  if (photo.lensModel) {
    exifRows.push({ label: "レンズ", value: photo.lensModel });
  }
  if (photo.focalLength !== null) {
    exifRows.push({ label: "焦点距離", value: `${photo.focalLength} mm` });
  }
  if (photo.aperture !== null) {
    exifRows.push({ label: "絞り", value: `f/${photo.aperture}` });
  }
  if (photo.shutterSpeed) {
    exifRows.push({ label: "シャッター速度", value: `${photo.shutterSpeed} s` });
  }
  if (photo.iso !== null) {
    exifRows.push({ label: "ISO", value: `ISO ${photo.iso}` });
  }

  const fileRows: InfoRow[] = [
    { label: "サイズ", value: `${photo.width} × ${photo.height}` },
    { label: "ファイルサイズ", value: formatBytes(photo.fileSize) },
    { label: "形式", value: photo.mimeType },
  ];
  const takenAt = formatDateTime(photo.takenAt);
  if (takenAt) {
    fileRows.push({ label: "撮影日時", value: takenAt });
  }
  const uploaded = formatDateTime(photo.uploadedAt);
  if (uploaded) {
    fileRows.push({ label: "アップロード日時", value: uploaded });
  }

  const { canvasRef, reset, scale, stageProps, stageRef, zoomTo } = usePhotoZoom(photo.id);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [alt, setAlt] = useState(photo.alt ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [settingCover, startSettingCover] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dirty = caption.trim() !== (photo.caption ?? "") || alt.trim() !== (photo.alt ?? "");
  const currentAlbum = photo.albums.find((album) => album.slug === albumSlug);
  const isCover = currentAlbum?.coverPhotoId === photo.id;

  const handleCover = (albumId: string) => {
    startSettingCover(async () => {
      setErrorMessage(null);
      try {
        const result = await setAlbumCover({ data: { albumId, photoId: photo.id } });
        if (result.success) {
          await router.invalidate();
        } else {
          setErrorMessage(result.error);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    });
  };

  const handleGenerate = async () => {
    if (generating) {
      return;
    }
    setGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generatePhotoDraft({ data: { id: photo.id } });
      if (result.success) {
        setCaption(result.caption ?? "");
        setAlt(result.alt ?? "");
      } else {
        setErrorMessage(result.error);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
    setGenerating(false);
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await updatePhotos({
        data: {
          items: [{ alt: alt.trim() || null, caption: caption.trim() || null, id: photo.id }],
        },
      });
      if (!result.success) {
        setErrorMessage(result.error);
      } else if (result.updated === 0) {
        setErrorMessage("写真が見つかりません");
      } else {
        await router.invalidate();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
    setSubmitting(false);
  };

  const listLink =
    albumSlug === undefined
      ? ({ search: { order }, to: "/admin" } as const)
      : ({ params: { slug: albumSlug }, search: { order }, to: "/admin/albums/$slug" } as const);

  useHotkeys([
    [
      "ArrowLeft",
      () => previousId !== null && router.navigate(photoDetailLink(previousId, albumSlug, order)),
    ],
    [
      "ArrowRight",
      () => nextId !== null && router.navigate(photoDetailLink(nextId, albumSlug, order)),
    ],
    ["Escape", () => router.navigate(listLink)],
  ]);

  const neighborButton = (photoId: string | null, direction: "previous" | "next") => {
    const label = direction === "previous" ? "前の写真" : "次の写真";
    const icon =
      direction === "previous" ? <ChevronLeftIcon size={16} /> : <ChevronRightIcon size={16} />;
    if (photoId === null) {
      return (
        <ActionIcon variant="default" disabled aria-label={label}>
          {icon}
        </ActionIcon>
      );
    }
    return (
      <ActionIcon
        variant="default"
        aria-label={label}
        renderRoot={(props) => <Link {...props} {...photoDetailLink(photoId, albumSlug, order)} />}
      >
        {icon}
      </ActionIcon>
    );
  };

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between" align="center" wrap="nowrap">
        <div>
          <Button
            variant="subtle"
            size="xs"
            w="fit-content"
            leftSection={<ArrowLeftIcon size={14} />}
            renderRoot={(props) => <Link {...props} {...listLink} />}
          >
            {albumSlug === undefined ? "写真一覧に戻る" : "アルバムに戻る"}
          </Button>
        </div>
        <Group gap="xs" wrap="nowrap">
          {currentAlbum && (
            <Menu id="photo-actions" position="bottom-end" shadow="md" width={240}>
              <Menu.Target>
                <ActionIcon variant="default" disabled={settingCover} aria-label="この写真の操作">
                  <EllipsisIcon size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{currentAlbum.title}</Menu.Label>
                <Menu.Item
                  leftSection={isCover ? <CheckIcon size={14} /> : <ImageIcon size={14} />}
                  disabled={isCover || settingCover}
                  onClick={() => {
                    handleCover(currentAlbum.id);
                  }}
                >
                  {isCover ? "このアルバムのカバーです" : "このアルバムのカバーにする"}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
          {neighborButton(previousId, "previous")}
          {neighborButton(nextId, "next")}
        </Group>
      </Group>

      <div className={classes.layout}>
        <div className={classes.viewer}>
          <div ref={stageRef} className={classes.stage} {...stageProps}>
            <div ref={canvasRef} className={classes.canvas}>
              <img
                src={imageSrc}
                alt={alt || caption || ""}
                draggable={false}
                aria-actions={
                  currentAlbum
                    ? "photo-actions photo-zoom-out photo-zoom-in photo-zoom-reset"
                    : "photo-zoom-out photo-zoom-in photo-zoom-reset"
                }
              />
            </div>
          </div>
          <Group className={classes.toolbar} gap="xs" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ActionIcon
                id="photo-zoom-out"
                variant="default"
                onClick={() => zoomTo(scale / 1.5)}
                disabled={scale <= 0.25}
                aria-label="縮小する"
              >
                <ZoomOutIcon size={16} />
              </ActionIcon>
              <Text size="sm" c="dimmed" w={48} ta="center">
                {Math.round(scale * 100)}%
              </Text>
              <ActionIcon
                id="photo-zoom-in"
                variant="default"
                onClick={() => zoomTo(scale * 1.5)}
                disabled={scale >= 4}
                aria-label="拡大する"
              >
                <ZoomInIcon size={16} />
              </ActionIcon>
              <ActionIcon
                id="photo-zoom-reset"
                variant="default"
                onClick={reset}
                disabled={scale === 1}
                aria-label="全体を表示する"
              >
                <ExpandIcon size={16} />
              </ActionIcon>
            </Group>
            <Anchor
              href={photoImageUrl(photo.storageKey)}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              原寸で開く
            </Anchor>
          </Group>
        </div>

        <Stack gap="md" className={classes.side}>
          <Textarea
            label="キャプション"
            autosize
            minRows={2}
            value={caption}
            onChange={(e) => setCaption(e.currentTarget.value)}
            maxLength={2000}
          />
          <Textarea
            label="代替テキスト"
            autosize
            minRows={3}
            value={alt}
            onChange={(e) => setAlt(e.currentTarget.value)}
            maxLength={500}
          />
          {errorMessage && (
            <Text size="sm" c="red" role="alert">
              {errorMessage}
            </Text>
          )}
          <Group justify="space-between">
            <Button
              variant="light"
              leftSection={<SparklesIcon size={16} />}
              loading={generating}
              disabled={submitting}
              onClick={handleGenerate}
            >
              AIで生成する
            </Button>
            <Button
              leftSection={<SaveIcon size={16} />}
              loading={submitting}
              disabled={generating || !dirty}
              onClick={handleSubmit}
            >
              保存する
            </Button>
          </Group>

          <PhotoLocationEditor
            photoId={photo.id}
            latitude={photo.latitude}
            longitude={photo.longitude}
            altitude={photo.altitude}
          />

          <Card withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Title order={4}>ファイル情報</Title>
              {renderInfoList(fileRows)}
            </Stack>
          </Card>

          {exifRows.length > 0 && (
            <Card withBorder radius="md" padding="md">
              <Stack gap="xs">
                <Title order={4}>EXIF</Title>
                {renderInfoList(exifRows)}
              </Stack>
            </Card>
          )}

          <Card withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Title order={4}>アルバム</Title>
              {photo.albums.length === 0 ? (
                <Text size="sm" c="dimmed">
                  どのアルバムにも入っていません
                </Text>
              ) : (
                <Stack gap={6}>
                  {photo.albums.map((album) => (
                    <Group key={album.id} gap={6} wrap="nowrap">
                      <VisibilityIcon visibility={album.visibility} size={14} />
                      <Anchor
                        size="sm"
                        renderRoot={(props) => (
                          <Link {...props} to="/admin/albums/$slug" params={{ slug: album.slug }} />
                        )}
                      >
                        {album.title}
                      </Anchor>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Stack>
      </div>
    </Stack>
  );
};
