import { Checkbox, Table, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { MapPinOffIcon } from "lucide-react";

import { formatDateTime } from "#/lib/format.ts";
import { photoImageUrl } from "#/lib/image-url.ts";
import { photoDetailLink } from "#/lib/photo-link.ts";

import classes from "./PhotoTable.module.css";

import type { PhotoCardData } from "#/components/molecules/PhotoCard/index.tsx";

type PhotoTableProps = {
  photos: PhotoCardData[];
  actionsId: string;
  albumSlug?: string;
  order: "asc" | "desc";
  selectedPhotoIds: Set<string>;
  onSelect: (photoId: string, extend: boolean) => void;
};

export const PhotoTable = ({
  photos,
  actionsId,
  albumSlug,
  order,
  selectedPhotoIds,
  onSelect,
}: PhotoTableProps) => (
  <Table.ScrollContainer minWidth={640}>
    <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={44} />
          <Table.Th w={72}>写真</Table.Th>
          <Table.Th>キャプション</Table.Th>
          <Table.Th>代替テキスト</Table.Th>
          <Table.Th w={180}>撮影日時</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {photos.map((p) => {
          const selected = selectedPhotoIds.has(p.id);
          const src = photoImageUrl(p.storageKey, 320);
          const name = p.caption ?? p.alt;
          return (
            <Table.Tr key={p.id} bg={selected ? "var(--mantine-color-blue-light)" : undefined}>
              <Table.Td>
                <Checkbox
                  checked={selected}
                  readOnly
                  onClick={(event) => onSelect(p.id, event.shiftKey)}
                  aria-label={name ?? "この写真を選択する"}
                  aria-actions={selected ? actionsId : undefined}
                />
              </Table.Td>
              <Table.Td>
                <div className={classes.frame}>
                  <img className={classes.thumb} src={src} alt="" loading="lazy" />
                  {!p.hasLocation && (
                    <span className={classes.badge}>
                      <MapPinOffIcon size={12} role="img" aria-label="位置情報が未設定" />
                    </span>
                  )}
                </div>
              </Table.Td>
              <Table.Td>
                <Link {...photoDetailLink(p.id, albumSlug, order)} className={classes.link}>
                  {name ?? "(キャプションなし)"}
                </Link>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {p.alt ?? "—"}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatDateTime(p.takenAt) ?? "—"}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>
);
