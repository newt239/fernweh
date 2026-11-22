import { useMemo, useState } from "react";

import {
  Anchor,
  Button,
  Checkbox,
  FileInput,
  Grid,
  Group,
  Input,
  NumberInput,
  Paper,
  Slider,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { MapPinIcon, SearchCheckIcon } from "lucide-react";

import { TimelineMatchMap } from "#/components/organisms/TimelineMatchMap/index.tsx";
import { formatDateTime } from "#/lib/format.ts";
import { photoImageUrl } from "#/lib/image-url.ts";
import { matchTimeline, parseTimeline, type Timeline } from "#/lib/timeline.ts";
import { applyPhotoLocations } from "#/server/photos.ts";

type GeotagCandidate = {
  id: string;
  caption: string | null;
  alt: string | null;
  storageKey: string;
  takenAt: string | null;
};

type Props = {
  photos: GeotagCandidate[];
};

export const TimelineGeotagPanel = ({ photos }: Props) => {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [toleranceMinutes, setToleranceMinutes] = useState(5);
  const [offsetHours, setOffsetHours] = useState<string | number>(0);
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!timeline) {
      return [];
    }
    const toleranceMs = toleranceMinutes * 60_000;
    const offsetMs = Number(offsetHours || 0) * 3_600_000;
    return photos.flatMap((photo) => {
      if (!photo.takenAt) {
        return [];
      }
      const takenAtMs = Date.parse(photo.takenAt);
      if (Number.isNaN(takenAtMs)) {
        return [];
      }
      const match = matchTimeline(timeline, takenAtMs + offsetMs, toleranceMs);
      return match ? [{ match, photo }] : [];
    });
  }, [timeline, photos, toleranceMinutes, offsetHours]);

  const selected = matches.filter((row) => !excludedIds.has(row.photo.id));
  const datedCount = photos.filter((photo) => photo.takenAt !== null).length;

  const points = useMemo(
    () =>
      matches.map(({ match, photo }) => ({
        id: photo.id,
        label: `${formatDateTime(photo.takenAt) ?? ""}（${Math.round(match.diffMs / 60_000)} 分差）`,
        latitude: match.latitude,
        longitude: match.longitude,
        selected: !excludedIds.has(photo.id),
      })),
    [matches, excludedIds],
  );

  const toggle = (id: string, checked: boolean) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleParse = async () => {
    if (!file || parsing) {
      return;
    }
    setParsing(true);
    setErrorMessage(null);
    setResultMessage(null);
    setTimeline(null);
    setExcludedIds(new Set());
    setFocusedId(null);
    try {
      const parsed = parseTimeline(await file.text());
      if (parsed.samples.length === 0 && parsed.visits.length === 0) {
        setErrorMessage("このファイルからは位置情報の記録が見つかりませんでした");
      } else {
        setTimeline(parsed);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
    setParsing(false);
  };

  const handleApply = async () => {
    if (applying) {
      return;
    }
    setApplying(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      let updated = 0;
      let failure: string | null = null;
      for (let index = 0; index < selected.length; index += 100) {
        const items = selected.slice(index, index + 100).map((row) => ({
          id: row.photo.id,
          latitude: row.match.latitude,
          longitude: row.match.longitude,
        }));
        // 1 リクエストあたりの件数を抑えるため分割して順に送信する
        const result = await applyPhotoLocations({ data: { items } });
        if (!result.success) {
          failure = result.error;
          break;
        }
        updated += result.updated;
      }
      if (failure === null) {
        setResultMessage(`${updated} 件の写真に位置情報を設定しました`);
        setTimeline(null);
        setFile(null);
        setExcludedIds(new Set());
        setFocusedId(null);
        await router.invalidate();
      } else {
        setErrorMessage(failure);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
    setApplying(false);
  };

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            位置情報が未設定の写真は {photos.length} 件（うち撮影日時があるものは {datedCount}{" "}
            件）です。
          </Text>

          <FileInput
            label="タイムラインの JSON ファイル"
            description="Google マップアプリの「タイムライン」からエクスポートしたファイルを選択します"
            placeholder="ファイルを選択"
            accept="application/json,.json"
            clearable
            value={file}
            onChange={setFile}
          />

          <Group grow align="flex-start">
            <Input.Wrapper
              label="許容する時刻差"
              description="撮影時刻との差がこの範囲内にある記録だけを照合します"
            >
              <Slider
                mt="lg"
                mb="lg"
                min={1}
                max={60}
                step={1}
                value={toleranceMinutes}
                onChange={setToleranceMinutes}
                label={(value) => `±${value} 分`}
                labelAlwaysOn
                marks={[
                  { label: "1 分", value: 1 },
                  { label: "30 分", value: 30 },
                  { label: "60 分", value: 60 },
                ]}
              />
            </Input.Wrapper>
            <NumberInput
              label="撮影時刻の補正（時間）"
              description="撮影時刻にこの時間を足してから照合します"
              value={offsetHours}
              onChange={setOffsetHours}
              min={-14}
              max={14}
              step={1}
              allowDecimal
            />
          </Group>

          <Group justify="flex-end">
            <Button
              leftSection={<SearchCheckIcon size={16} />}
              onClick={handleParse}
              loading={parsing}
              disabled={!file || applying}
            >
              照合する
            </Button>
          </Group>

          {errorMessage && (
            <Text size="sm" c="red">
              {errorMessage}
            </Text>
          )}
          {resultMessage && (
            <Text size="sm" c="green">
              {resultMessage}
            </Text>
          )}
        </Stack>
      </Paper>

      {timeline && (
        <Stack gap="sm">
          <Text size="sm">
            {matches.length} 件の写真が照合できました（選択中 {selected.length}{" "}
            件）。表の推定位置をクリックすると地図で確認できます。
          </Text>
          {matches.length > 0 && (
            <Grid>
              <Grid.Col span={{ base: 12, md: 7 }} order={{ base: 2, md: 1 }}>
                <Table.ScrollContainer minWidth={640}>
                  <Table verticalSpacing="sm" horizontalSpacing="md">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={48} />
                        <Table.Th w={72} />
                        <Table.Th w={180}>撮影日時</Table.Th>
                        <Table.Th>推定位置</Table.Th>
                        <Table.Th w={110}>時刻差</Table.Th>
                        <Table.Th w={90}>根拠</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {matches.map(({ match, photo }) => (
                        <Table.Tr key={photo.id}>
                          <Table.Td>
                            <Checkbox
                              checked={!excludedIds.has(photo.id)}
                              onChange={(event) => toggle(photo.id, event.currentTarget.checked)}
                              disabled={applying}
                              aria-label="この写真に適用する"
                              aria-actions={
                                excludedIds.has(photo.id) ? undefined : "timeline-geotag-apply"
                              }
                            />
                          </Table.Td>
                          <Table.Td>
                            <img
                              src={photoImageUrl(photo.storageKey, 320)}
                              alt={photo.alt ?? photo.caption ?? ""}
                              width={56}
                              height={56}
                              loading="lazy"
                              style={{ borderRadius: 6, objectFit: "cover" }}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{formatDateTime(photo.takenAt) ?? ""}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Anchor
                              component="button"
                              type="button"
                              size="sm"
                              onClick={() => setFocusedId(photo.id)}
                            >
                              {match.latitude.toFixed(6)}, {match.longitude.toFixed(6)}
                            </Anchor>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c={match.diffMs > 1_800_000 ? "orange" : undefined}>
                              {Math.round(match.diffMs / 60_000)} 分
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="dimmed">
                              {match.source === "visit"
                                ? "滞在"
                                : match.source === "interpolated"
                                  ? "補間"
                                  : "最近傍"}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }} order={{ base: 1, md: 2 }}>
                <TimelineMatchMap points={points} focusedId={focusedId} />
              </Grid.Col>
            </Grid>
          )}
          <Group justify="flex-end">
            <Button
              id="timeline-geotag-apply"
              leftSection={<MapPinIcon size={16} />}
              onClick={handleApply}
              loading={applying}
              disabled={selected.length === 0}
            >
              選択した {selected.length} 件に適用する
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
};
