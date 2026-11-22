import { Group, Stack, Text, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";

import { SignOutButton } from "#/components/atoms/SignOutButton/index.tsx";
import { ColorSchemeControl } from "#/components/molecules/ColorSchemeControl/index.tsx";
import { UserProfile } from "#/components/molecules/UserProfile/index.tsx";
import { APP_NAME } from "#/lib/app.ts";

const SettingsPage = () => (
  <Stack p="xl" gap="xl">
    <Title order={2}>設定</Title>

    <Stack gap="sm">
      <Text fw={600} size="sm">
        プロフィール
      </Text>
      <UserProfile />
    </Stack>

    <Stack gap="sm">
      <Text fw={600} size="sm">
        カラーテーマ
      </Text>
      <ColorSchemeControl />
    </Stack>

    <Stack gap="sm">
      <Text fw={600} size="sm">
        アカウント
      </Text>
      <Group>
        <SignOutButton />
      </Group>
    </Stack>
  </Stack>
);

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: `設定 | ${APP_NAME}` }] }),
});
