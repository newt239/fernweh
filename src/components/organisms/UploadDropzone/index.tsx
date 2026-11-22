import { useEffect, useState } from "react";

import { Button, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { Dropzone, IMAGE_MIME_TYPE } from "@mantine/dropzone";
import { useRouter } from "@tanstack/react-router";
import { EraserIcon, SaveIcon, SparklesIcon } from "lucide-react";

import { PhotoPreviewModal } from "#/components/molecules/PhotoPreviewModal/index.tsx";
import { TimeZoneSelect } from "#/components/molecules/TimeZoneSelect/index.tsx";
import {
  UploadDraftRow,
  type UploadDraftItem,
} from "#/components/molecules/UploadDraftRow/index.tsx";
import { runConcurrently } from "#/lib/concurrent.ts";
import { extractExif, probeDimensions } from "#/lib/image.ts";
import { encodeThumbHash } from "#/lib/thumbhash.ts";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "#/lib/upload-constraints.ts";
import { generatePhotoDraft } from "#/server/photo-draft.ts";
import { createPhotoUpload, finalizePhoto, updatePhotos } from "#/server/photos.ts";

export const UploadDropzone = ({ onComplete }: { onComplete?: (photoIds: string[]) => void }) => {
  const [items, setItems] = useState<UploadDraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [generatingField, setGeneratingField] = useState<"caption" | "alt" | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState(
    () => new Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const router = useRouter();
  const editable = items.flatMap((it) =>
    it.status === "done" && it.photoId ? [{ ...it, photoId: it.photoId }] : [],
  );
  const unsavedCount = editable.filter((it) => !it.saved).length;
  const preview = items.find((it) => it.id === previewId);

  const updateItem = (id: string, patch: Partial<UploadDraftItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const uploadOne = async (file: File, id: string) => {
    const contentType = ALLOWED_MIME_TYPES.find((mime) => mime === file.type.toLowerCase());
    if (!contentType) {
      updateItem(id, { error: `非対応の形式: ${file.type}`, status: "error" });
      return null;
    }
    try {
      updateItem(id, { progress: 5, status: "preparing" });
      const [dims, exif, placeholder] = await Promise.all([
        probeDimensions(file),
        extractExif(file, timeZone),
        encodeThumbHash(file),
      ]);
      updateItem(id, { thumbUrl: URL.createObjectURL(file) });

      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const contentHash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      updateItem(id, { progress: 25 });
      const prep = await createPhotoUpload({
        data: {
          contentHash,
          contentType,
          size: file.size,
        },
      });
      if (!prep.success) {
        updateItem(id, { error: prep.error, status: "error" });
        return null;
      }
      if (prep.kind === "duplicate") {
        updateItem(id, {
          duplicatePhotoId: prep.photoId,
          progress: 100,
          status: "duplicate",
        });
        return prep.photoId;
      }

      updateItem(id, { progress: 40, status: "uploading" });
      const uploaded = await fetch(prep.originalUrl, {
        body: file,
        headers: { "Content-Type": contentType },
        method: "PUT",
      });
      if (!uploaded.ok) {
        throw new Error(`R2_PUT_FAILED_${uploaded.status}`);
      }

      updateItem(id, { progress: 85, status: "saving" });
      const saved = await finalizePhoto({
        data: {
          contentHash,
          fileSize: file.size,
          height: dims.height,
          mimeType: contentType,
          originalKey: prep.originalKey,
          photoId: prep.photoId,
          placeholder,
          width: dims.width,
          ...exif,
        },
      });
      if (!saved.success) {
        if ("duplicatePhotoId" in saved) {
          updateItem(id, {
            duplicatePhotoId: saved.duplicatePhotoId,
            progress: 100,
            status: "duplicate",
          });
          return saved.duplicatePhotoId;
        }
        updateItem(id, { error: saved.error, status: "error" });
        return null;
      }

      updateItem(id, { photoId: prep.photoId, progress: 100, status: "done" });
      return prep.photoId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateItem(id, { error: message, status: "error" });
      return null;
    }
  };

  const handleDrop = async (files: File[]) => {
    const batch: { file: File; item: UploadDraftItem }[] = files.map((file) => ({
      file,
      item: {
        alt: "",
        caption: "",
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        progress: 0,
        status: "queued",
      },
    }));
    setItems((prev) => [...prev, ...batch.map((b) => b.item)]);
    setBusy(true);
    try {
      const uploadedIds: string[] = [];
      for (const { file, item } of batch) {
        // 進捗表示と負荷抑制のため意図的に 1 件ずつ逐次アップロードする
        const photoId = await uploadOne(file, item.id);
        if (photoId) {
          uploadedIds.push(photoId);
        }
      }
      await router.invalidate();
      onComplete?.(uploadedIds);
    } finally {
      setBusy(false);
    }
  };

  // 共有シートから受け取ったファイルは Service Worker が Cache API に退避している
  useEffect(() => {
    caches.open("share-target").then(async (cache) => {
      const keys = await cache.keys();
      if (keys.length === 0) {
        return;
      }
      const files = await Promise.all(
        keys.map(async (key) => {
          const response = await cache.match(key);
          if (!response) {
            return null;
          }
          const blob = await response.blob();
          const name = decodeURIComponent(response.headers.get("x-filename") ?? "shared");
          return new File([blob], name, { type: blob.type });
        }),
      );
      // 再読み込みで二重にアップロードされないよう取り込む前に消す
      await Promise.all(keys.map((key) => cache.delete(key)));
      await handleDrop(files.filter((file) => file !== null));
    });
    // マウント時に一度だけ取り込むため handleDrop は依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateOne = async (id: string, photoId: string, field: "caption" | "alt") => {
    updateItem(id, { error: undefined, generating: field });
    try {
      const result = await generatePhotoDraft({ data: { fields: [field], id: photoId } });
      if (result.success) {
        updateItem(id, {
          generating: undefined,
          saved: false,
          ...(field === "caption" ? { caption: result.caption ?? "" } : { alt: result.alt ?? "" }),
        });
      } else {
        updateItem(id, { error: result.error, generating: undefined });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateItem(id, { error: message, generating: undefined });
    }
  };

  const generateAll = async (field: "caption" | "alt") => {
    if (editable.length === 0 || generatingField) {
      return;
    }
    setGeneratingField(field);
    try {
      await runConcurrently(editable, 3, (it) => generateOne(it.id, it.photoId, field));
    } finally {
      setGeneratingField(null);
    }
  };

  const saveAll = async () => {
    const targets = editable.filter((it) => !it.saved);
    if (targets.length === 0 || savingAll) {
      return;
    }
    setSavingAll(true);
    for (const target of targets) {
      updateItem(target.id, { error: undefined });
    }
    try {
      for (let offset = 0; offset < targets.length; offset += 100) {
        // 1 リクエストあたりの件数を抑えるため分割して順に送信する
        const chunk = targets.slice(offset, offset + 100);
        try {
          const result = await updatePhotos({
            data: {
              items: chunk.map((target) => ({
                alt: target.alt.trim() || null,
                caption: target.caption.trim() || null,
                id: target.photoId,
              })),
            },
          });
          for (const target of chunk) {
            updateItem(target.id, result.success ? { saved: true } : { error: result.error });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          for (const target of chunk) {
            updateItem(target.id, { error: message });
          }
        }
      }
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <Stack gap="md">
      <TimeZoneSelect value={timeZone} disabled={busy} onChange={setTimeZone} />

      <Dropzone
        onDrop={handleDrop}
        onReject={(rejections) => {
          console.warn("rejected files", rejections);
        }}
        accept={IMAGE_MIME_TYPE}
        maxSize={MAX_FILE_SIZE}
        loading={busy}
        multiple
      >
        <Group justify="center" mih={160} style={{ pointerEvents: "none" }}>
          <Stack align="center" gap={4}>
            <Text size="xl" fw={600}>
              画像をドラッグ&ドロップ
            </Text>
            <Text size="sm" c="dimmed">
              {`JPEG / PNG / WebP / AVIF / HEIC、1 ファイル ${MAX_FILE_SIZE / 1024 / 1024} MB まで`}
            </Text>
          </Stack>
        </Group>
      </Dropzone>

      {items.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group justify="space-between" gap="sm">
              <Group gap="sm">
                <Text size="xs" c="dimmed">
                  写真をクリックすると大きく表示します
                </Text>
                {unsavedCount > 0 && (
                  <Text size="xs" c="dimmed">
                    未保存の写真が {unsavedCount} 件あります
                  </Text>
                )}
              </Group>
              <Group gap="sm">
                <Button
                  variant="default"
                  leftSection={<EraserIcon size={16} />}
                  onClick={() => {
                    for (const it of items) {
                      if (it.thumbUrl) {
                        URL.revokeObjectURL(it.thumbUrl);
                      }
                    }
                    setItems([]);
                  }}
                  disabled={busy || savingAll || generatingField !== null}
                >
                  履歴を消去する
                </Button>
                <Button
                  leftSection={<SaveIcon size={16} />}
                  onClick={() => {
                    saveAll();
                  }}
                  loading={savingAll}
                  disabled={busy || generatingField !== null || unsavedCount === 0}
                >
                  保存する
                </Button>
              </Group>
            </Group>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={72}>写真</Table.Th>
                    <Table.Th w={200}>ファイル</Table.Th>
                    <Table.Th>
                      <Group gap="xs" wrap="nowrap" justify="space-between">
                        キャプション
                        <Button
                          size="compact-xs"
                          variant="light"
                          leftSection={<SparklesIcon size={12} />}
                          onClick={() => {
                            generateAll("caption");
                          }}
                          loading={generatingField === "caption"}
                          disabled={
                            busy || savingAll || generatingField === "alt" || editable.length === 0
                          }
                        >
                          まとめて生成する
                        </Button>
                      </Group>
                    </Table.Th>
                    <Table.Th>
                      <Group gap="xs" wrap="nowrap" justify="space-between">
                        代替テキスト
                        <Button
                          size="compact-xs"
                          variant="light"
                          leftSection={<SparklesIcon size={12} />}
                          onClick={() => {
                            generateAll("alt");
                          }}
                          loading={generatingField === "alt"}
                          disabled={
                            busy ||
                            savingAll ||
                            generatingField === "caption" ||
                            editable.length === 0
                          }
                        >
                          まとめて生成する
                        </Button>
                      </Group>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map((it) => (
                    <UploadDraftRow
                      key={it.id}
                      item={it}
                      generatingField={generatingField}
                      onPreview={() => setPreviewId(it.id)}
                      onChange={(patch) => updateItem(it.id, patch)}
                      onGenerate={(field) => {
                        if (it.photoId) {
                          generateOne(it.id, it.photoId, field);
                        }
                      }}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Paper>
      )}

      <PhotoPreviewModal
        photo={preview?.thumbUrl ? { name: preview.name, url: preview.thumbUrl } : null}
        onClose={() => setPreviewId(null)}
      />
    </Stack>
  );
};
