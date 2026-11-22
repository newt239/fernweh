import { useState } from "react";

import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { MapPinIcon, MapPinOffIcon, SaveIcon, Undo2Icon, XIcon } from "lucide-react";

import { LocationMap } from "#/components/molecules/LocationMap/index.tsx";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "#/lib/leaflet.ts";
import { updatePhotoLocation } from "#/server/photos.ts";

type Props = {
  photoId: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
};

export const PhotoLocationEditor = ({ photoId, latitude, longitude, altitude }: Props) => {
  const router = useRouter();
  const saved = latitude === null || longitude === null ? null : { latitude, longitude };
  const [draft, setDraft] = useState<{
    latitude: string | number;
    longitude: string | number;
  } | null>(saved);
  const [pending, setPending] = useState<"delete" | "save" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const draftLatitude =
    draft === null || draft.latitude === "" ? Number.NaN : Number(draft.latitude);
  const draftLongitude =
    draft === null || draft.longitude === "" ? Number.NaN : Number(draft.longitude);
  const valid =
    Number.isFinite(draftLatitude) &&
    Number.isFinite(draftLongitude) &&
    Math.abs(draftLatitude) <= 90 &&
    Math.abs(draftLongitude) <= 180;
  const dirty = valid && (draftLatitude !== latitude || draftLongitude !== longitude);

  const save = async (next: { latitude: number; longitude: number } | null) => {
    if (pending !== null) {
      return;
    }
    setPending(next === null ? "delete" : "save");
    setErrorMessage(null);
    try {
      const result = await updatePhotoLocation({
        data: {
          id: photoId,
          latitude: next === null ? null : next.latitude,
          longitude: next === null ? null : next.longitude,
        },
      });
      if (result.success) {
        setDraft(next);
        await router.invalidate();
      } else {
        setErrorMessage(result.error);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Title order={4}>位置情報</Title>

        {draft === null ? (
          <>
            <Text size="sm" c="dimmed">
              位置情報は設定されていません
            </Text>
            <Button
              variant="light"
              leftSection={<MapPinIcon size={16} />}
              onClick={() =>
                setDraft({ latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1] })
              }
            >
              地図から設定する
            </Button>
          </>
        ) : (
          <>
            {valid && (
              <LocationMap
                latitude={draftLatitude}
                longitude={draftLongitude}
                zoom={saved === null ? DEFAULT_ZOOM : 14}
                onChange={(nextLatitude, nextLongitude) => {
                  setDraft({
                    latitude: Number(nextLatitude.toFixed(6)),
                    longitude: Number(nextLongitude.toFixed(6)),
                  });
                }}
              />
            )}
            <Text size="xs" c="dimmed">
              地図をクリックするか、数値を直接入力して位置を変更できます
            </Text>
            <Group grow align="flex-start" gap="xs">
              <NumberInput
                label="緯度"
                value={draft.latitude}
                onChange={(value) => setDraft({ ...draft, latitude: value })}
                min={-90}
                max={90}
                step={0.001}
                decimalScale={6}
                disabled={pending !== null}
              />
              <NumberInput
                label="経度"
                value={draft.longitude}
                onChange={(value) => setDraft({ ...draft, longitude: value })}
                min={-180}
                max={180}
                step={0.001}
                decimalScale={6}
                disabled={pending !== null}
              />
            </Group>
            {altitude !== null && (
              <Group justify="space-between" gap="md" wrap="nowrap">
                <Text size="sm" c="dimmed">
                  標高
                </Text>
                <Text size="sm">{altitude.toFixed(1)} m</Text>
              </Group>
            )}
            {valid && (
              <Anchor
                href={`https://www.google.com/maps?q=${draftLatitude},${draftLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
              >
                Google Maps で開く
              </Anchor>
            )}
            <Group justify="flex-end" gap="xs">
              {dirty && (
                <Tooltip label="取り消す">
                  <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label="取り消す"
                    disabled={pending !== null}
                    onClick={() => setDraft(saved)}
                  >
                    <Undo2Icon size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {saved !== null && (
                <Tooltip label="位置情報を削除する">
                  <ActionIcon
                    variant="default"
                    color="red"
                    size="lg"
                    aria-label="位置情報を削除する"
                    loading={pending === "delete"}
                    disabled={pending === "save"}
                    onClick={() => setConfirming(true)}
                  >
                    <MapPinOffIcon size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Button
                leftSection={<SaveIcon size={16} />}
                loading={pending === "save"}
                disabled={!dirty || pending === "delete"}
                onClick={() => {
                  save({ latitude: draftLatitude, longitude: draftLongitude });
                }}
              >
                保存する
              </Button>
            </Group>
          </>
        )}

        {errorMessage && (
          <Text size="sm" c="red" role="alert">
            {errorMessage}
          </Text>
        )}
      </Stack>

      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        title="位置情報を削除する"
        centered
      >
        <Stack gap="md">
          <Text size="sm">この写真の緯度・経度と標高を削除します。この操作は取り消せません。</Text>
          <Text size="sm" c="dimmed">
            削除すると地図には表示されなくなります。
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              leftSection={<XIcon size={16} />}
              onClick={() => setConfirming(false)}
              disabled={pending === "delete"}
            >
              キャンセルする
            </Button>
            <Button
              color="red"
              leftSection={<MapPinOffIcon size={16} />}
              loading={pending === "delete"}
              onClick={() => {
                save(null).then(() => setConfirming(false));
              }}
            >
              削除する
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
};
