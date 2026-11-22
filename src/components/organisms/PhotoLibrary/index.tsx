import { useState } from "react";

import { Group, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { useRouter } from "@tanstack/react-router";

import { PhotoViewControls } from "#/components/molecules/PhotoViewControls/index.tsx";
import { PhotoBulkActions } from "#/components/organisms/PhotoBulkActions/index.tsx";
import { PhotoMasonry } from "#/components/organisms/PhotoMasonry/index.tsx";
import { PhotoTable } from "#/components/organisms/PhotoTable/index.tsx";
import { addPhotosToAlbum, createAlbum, removePhotosFromAlbum } from "#/server/albums.ts";
import { deletePhotos } from "#/server/photos.ts";

import type { PhotoCardData } from "#/components/molecules/PhotoCard/index.tsx";

type PhotoLibraryProps = {
  photos: PhotoCardData[];
  albums: { id: string; title: string }[];
  order: "asc" | "desc";
  view: "grid" | "table";
  onOrderChange: (next: "asc" | "desc") => void;
  onViewChange: (next: "grid" | "table") => void;
  album?: { id: string; slug: string };
  emptyMessage: string;
};

export const PhotoLibrary = ({
  photos,
  albums,
  order,
  view,
  onOrderChange,
  onViewChange,
  album,
  emptyMessage,
}: PhotoLibraryProps) => {
  const router = useRouter();
  const [selected, setSelected] = useState(new Set<string>());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | "create" | "delete" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bulkActionsId = "photo-bulk-actions";

  const toggle = (photoId: string, extend: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (extend) {
        const anchorIndex = photos.findIndex((p) => p.id === lastSelectedId);
        const targetIndex = photos.findIndex((p) => p.id === photoId);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [from, to] =
            anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          for (const photo of photos.slice(from, to + 1)) {
            next.add(photo.id);
          }
          return next;
        }
      }
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
    setLastSelectedId(photoId);
  };

  const selectAll = () => {
    setSelected((prev) => new Set([...prev, ...photos.map((p) => p.id)]));
  };

  useHotkeys([
    ["Backspace", () => selected.size > 0 && setModal("delete")],
    ["Delete", () => selected.size > 0 && setModal("delete")],
    ["Escape", () => setSelected(new Set())],
    ["mod+A", selectAll],
  ]);

  const List = view === "table" ? PhotoTable : PhotoMasonry;

  const run = async (action: () => Promise<void>) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    }
    setSubmitting(false);
  };

  const handleRemove = async (target: { id: string }) => {
    await run(async () => {
      const result = await removePhotosFromAlbum({
        data: { albumId: target.id, photoIds: [...selected] },
      });
      if (result.success) {
        setSelected(new Set());
        setNotice(`${result.removed} 枚をアルバムから外しました`);
        await router.invalidate();
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = async () => {
    await run(async () => {
      const result = await deletePhotos({ data: { ids: [...selected] } });
      if (result.success) {
        setSelected(new Set());
        setNotice(`${result.deleted} 枚を削除しました`);
        await router.invalidate();
      } else {
        setError(result.error);
      }
    });
  };

  const handleAddToAlbum = async (albumId: string) => {
    await run(async () => {
      const result = await addPhotosToAlbum({ data: { albumId, photoIds: [...selected] } });
      if (result.success) {
        setSelected(new Set());
        setNotice(
          album
            ? `${result.inserted} 枚を別のアルバムに追加しました`
            : `${result.inserted} 枚をアルバムに追加しました`,
        );
        await router.invalidate();
      } else {
        setError(result.error);
      }
    });
  };

  const handleCreateAlbum = async (title: string) => {
    await run(async () => {
      const created = await createAlbum({ data: { title } });
      if (!created.success) {
        setError(created.error);
        return;
      }
      const result = await addPhotosToAlbum({
        data: { albumId: created.id, photoIds: [...selected] },
      });
      if (result.success) {
        setSelected(new Set());
        await router.navigate({ params: { slug: created.slug }, to: "/admin/albums/$slug" });
        await router.invalidate();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <PhotoViewControls
          order={order}
          view={view}
          onOrderChange={onOrderChange}
          onViewChange={onViewChange}
        />
        {selected.size > 0 && (
          <PhotoBulkActions
            selectedCount={selected.size}
            submitting={submitting}
            albums={album ? albums.filter((a) => a.id !== album.id) : albums}
            menuId={bulkActionsId}
            modal={modal}
            onModalChange={setModal}
            onSelectAll={selectAll}
            onCancel={() => {
              setSelected(new Set());
              setError(null);
            }}
            onDelete={handleDelete}
            onAddToAlbum={handleAddToAlbum}
            onCreateAlbum={handleCreateAlbum}
            onRemoveFromAlbum={album ? () => handleRemove(album) : undefined}
          />
        )}
      </Group>

      {error && (
        <Text size="sm" c="red" role="alert">
          {error}
        </Text>
      )}
      {notice && (
        <Text size="sm" c="dimmed" role="status">
          {notice}
        </Text>
      )}

      {photos.length === 0 ? (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      ) : (
        <List
          photos={photos}
          actionsId={bulkActionsId}
          albumSlug={album?.slug}
          order={order}
          selectedPhotoIds={selected}
          onSelect={toggle}
        />
      )}
    </>
  );
};
