import { useState } from "react";

import {
  ActionIcon,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { SaveIcon, SparklesIcon } from "lucide-react";

import { PhotoPreviewModal } from "#/components/molecules/PhotoPreviewModal/index.tsx";
import { runConcurrently } from "#/lib/concurrent.ts";
import { photoImageUrl } from "#/lib/image-url.ts";
import { generatePhotoDraft } from "#/server/photo-draft.ts";
import { updatePhotos } from "#/server/photos.ts";

type DraftRow = {
  id: string;
  alt: string;
  caption: string;
  storageKey: string;
  generating?: "caption" | "alt";
  error?: string;
};

type PhotoDraftQueueProps = {
  photos: { id: string; alt: string | null; caption: string | null; storageKey: string }[];
  total: number;
  field: "caption" | "alt";
  onFieldChange: (next: "caption" | "alt") => void;
};

export const PhotoDraftQueue = ({ photos, total, field, onFieldChange }: PhotoDraftQueueProps) => {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>(() =>
    photos.map((photo) => ({
      alt: photo.alt ?? "",
      caption: photo.caption ?? "",
      id: photo.id,
      storageKey: photo.storageKey,
    })),
  );
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const preview = rows.find((row) => row.id === previewId);

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const generateOne = async (id: string, target: "caption" | "alt") => {
    updateRow(id, { error: undefined, generating: target });
    try {
      const result = await generatePhotoDraft({ data: { fields: [target], id } });
      if (result.success) {
        updateRow(id, {
          generating: undefined,
          ...(target === "caption" ? { caption: result.caption ?? "" } : { alt: result.alt ?? "" }),
        });
      } else {
        updateRow(id, { error: result.error, generating: undefined });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateRow(id, { error: message, generating: undefined });
    }
  };

  const generateAll = async () => {
    if (rows.length === 0 || generating) {
      return;
    }
    setGenerating(true);
    try {
      await runConcurrently(
        rows.map((row) => row.id),
        3,
        (id) => generateOne(id, field),
      );
    } finally {
      setGenerating(false);
    }
  };

  const saveAll = async () => {
    if (rows.length === 0 || saving) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await updatePhotos({
        data: {
          items: rows.map((row) => ({
            alt: row.alt.trim() || null,
            caption: row.caption.trim() || null,
            id: row.id,
          })),
        },
      });
      if (result.success) {
        await router.invalidate();
      } else {
        setErrorMessage(result.error);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" gap="sm">
        <Group gap="sm">
          <SegmentedControl
            value={field}
            onChange={onFieldChange}
            data={[
              { label: "キャプション", value: "caption" },
              { label: "代替テキスト", value: "alt" },
            ]}
            disabled={generating || saving}
          />
          <Text size="sm" c="dimmed">
            {`未入力 ${total} 枚のうち ${rows.length} 枚を表示中`}
          </Text>
        </Group>
        <Group gap="sm">
          <Button
            variant="light"
            leftSection={<SparklesIcon size={16} />}
            onClick={() => {
              generateAll();
            }}
            loading={generating}
            disabled={saving || rows.length === 0}
          >
            まとめて生成する
          </Button>
          <Button
            leftSection={<SaveIcon size={16} />}
            onClick={() => {
              saveAll();
            }}
            loading={saving}
            disabled={generating || rows.length === 0}
          >
            保存する
          </Button>
        </Group>
      </Group>

      {errorMessage && (
        <Text size="sm" c="red" role="alert">
          {errorMessage}
        </Text>
      )}

      {rows.length === 0 ? (
        <Text c="dimmed">未入力の写真はありません</Text>
      ) : (
        <Paper withBorder p="md" radius="md">
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={72}>写真</Table.Th>
                  <Table.Th>キャプション</Table.Th>
                  <Table.Th>代替テキスト</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Stack gap={4}>
                        <UnstyledButton
                          onClick={() => setPreviewId(row.id)}
                          aria-label="写真を大きく表示する"
                          style={{ cursor: "zoom-in", display: "block" }}
                        >
                          <img
                            src={photoImageUrl(row.storageKey, 320)}
                            alt=""
                            width={56}
                            height={56}
                            loading="lazy"
                            style={{ borderRadius: 6, display: "block", objectFit: "cover" }}
                          />
                        </UnstyledButton>
                        {row.error && (
                          <Text size="xs" c="red" role="alert">
                            {row.error}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Textarea
                        value={row.caption}
                        onChange={(event) =>
                          updateRow(row.id, { caption: event.currentTarget.value })
                        }
                        disabled={row.generating === "caption"}
                        autosize
                        minRows={1}
                        maxLength={2000}
                        rightSection={
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="キャプションをAIで生成する"
                            onClick={() => {
                              generateOne(row.id, "caption");
                            }}
                            loading={row.generating === "caption"}
                            disabled={generating || saving}
                          >
                            <SparklesIcon size={14} />
                          </ActionIcon>
                        }
                        rightSectionPointerEvents="all"
                        rightSectionProps={{ style: { alignItems: "flex-start", paddingTop: 4 } }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Textarea
                        value={row.alt}
                        onChange={(event) => updateRow(row.id, { alt: event.currentTarget.value })}
                        disabled={row.generating === "alt"}
                        autosize
                        minRows={1}
                        maxLength={500}
                        rightSection={
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="代替テキストをAIで生成する"
                            onClick={() => {
                              generateOne(row.id, "alt");
                            }}
                            loading={row.generating === "alt"}
                            disabled={generating || saving}
                          >
                            <SparklesIcon size={14} />
                          </ActionIcon>
                        }
                        rightSectionPointerEvents="all"
                        rightSectionProps={{ style: { alignItems: "flex-start", paddingTop: 4 } }}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <PhotoPreviewModal
        photo={preview ? { name: "写真", url: photoImageUrl(preview.storageKey, 1600) } : null}
        onClose={() => setPreviewId(null)}
      />
    </Stack>
  );
};
