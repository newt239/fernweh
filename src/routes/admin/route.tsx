import { AppShell, Burger, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AdminNavbar } from "#/components/organisms/AdminNavbar/index.tsx";
import { KeyboardShortcutHelp } from "#/components/organisms/KeyboardShortcutHelp/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { listMyAlbums } from "#/server/albums.ts";

const AdminLayout = () => {
  const { albums } = Route.useLoaderData();
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ breakpoint: "sm", collapsed: { mobile: !opened }, width: 240 }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Text component={Link} to="/admin" fw={700} c="inherit" td="none">
            {APP_NAME}
          </Text>
          <Group ml="auto" gap="xs">
            <KeyboardShortcutHelp />
          </Group>
        </Group>
      </AppShell.Header>

      <AdminNavbar albums={albums} onNavigate={close} />

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  loader: async () => {
    const result = await listMyAlbums({ data: {} });
    if (!result.success) {
      throw redirect({ params: { _splat: "" }, to: "/login/$" });
    }
    return result;
  },
});
