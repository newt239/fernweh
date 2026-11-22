import { Stack, Text, Title } from "@mantine/core";
import { createFileRoute, notFound } from "@tanstack/react-router";
import leafletCss from "leaflet/dist/leaflet.css?url";

import { TimelineGeotagPanel } from "#/components/organisms/TimelineGeotagPanel/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { listPhotosMissingLocation } from "#/server/photos.ts";

const PhotosGeotagPage = () => {
  const { photos } = Route.useLoaderData();
  return (
    <Stack p="xl" gap="md">
      <Title order={2}>位置情報の一括設定</Title>
      <Text c="dimmed" size="sm">
        Google マップのタイムラインからエクスポートした JSON
        を読み込み、撮影日時が近い記録をもとに位置情報が未設定の写真を補完します。ファイルはブラウザ内で解析され、サーバーには送信されません。
      </Text>
      <TimelineGeotagPanel photos={photos} />
    </Stack>
  );
};

export const Route = createFileRoute("/admin/photos/geotag")({
  component: PhotosGeotagPage,
  head: () => ({
    links: [{ href: leafletCss, rel: "stylesheet" }],
    meta: [{ title: `位置情報の一括設定 | ${APP_NAME}` }],
  }),
  loader: async () => {
    const result = await listPhotosMissingLocation({ data: {} });
    if (!result.success) {
      throw notFound();
    }
    return result;
  },
});
