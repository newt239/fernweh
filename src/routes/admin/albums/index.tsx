import { SimpleGrid, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, notFound, useLoaderData } from "@tanstack/react-router";
import * as z from "zod";

import { AlbumCard } from "#/components/molecules/AlbumCard/index.tsx";
import { AlbumFilterBar, type AlbumFilters } from "#/components/molecules/AlbumFilterBar/index.tsx";
import { FilterHeader } from "#/components/molecules/FilterHeader/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { listMyAlbums } from "#/server/albums.ts";

const AlbumsIndexPage = () => {
  const { albums: filtered } = Route.useLoaderData();
  const { albums: allAlbums } = useLoaderData({ from: "/admin" });
  const albums = filtered ?? allAlbums;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filterOpened, { toggle: toggleFilter }] = useDisclosure(false);
  const years = [
    ...new Set(
      allAlbums.flatMap((album) => (album.periodStart ? [album.periodStart.slice(0, 4)] : [])),
    ),
  ].toSorted((a, b) => b.localeCompare(a));
  const appliedCount = [search.q, search.year].filter((value) => value !== undefined).length;

  return (
    <Stack p="xl" gap="md">
      <FilterHeader
        title="アルバム"
        appliedCount={appliedCount}
        opened={filterOpened}
        onToggle={toggleFilter}
      />

      <AlbumFilterBar
        key={[search.q, search.year].join("|")}
        filters={search}
        years={years}
        opened={filterOpened}
        appliedCount={appliedCount}
        onChange={(patch: AlbumFilters) => {
          navigate({ replace: true, search: (prev) => ({ ...prev, ...patch }) });
        }}
      />

      {albums.length === 0 ? (
        <Text c="dimmed" size="sm">
          {appliedCount > 0 ? "条件に合うアルバムはありません" : "アルバムはまだありません"}
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 2, md: 4, sm: 3 }} spacing="md">
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
};

const searchSchema = z.object({
  q: z.string().max(100).optional(),
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

const loaderDeps = ({ search }: { search: z.infer<typeof searchSchema> }) => ({
  q: search.q,
  year: search.year,
});

export const Route = createFileRoute("/admin/albums/")({
  component: AlbumsIndexPage,
  head: () => ({ meta: [{ title: `アルバム | ${APP_NAME}` }] }),
  loader: async ({ deps }: { deps: ReturnType<typeof loaderDeps> }) => {
    // 絞り込みが無いときは親 /admin の一覧と同じ結果になるため問い合わせない
    if (deps.q === undefined && deps.year === undefined) {
      return { albums: null };
    }
    const result = await listMyAlbums({ data: { q: deps.q, year: deps.year } });
    if (!result.success) {
      throw notFound();
    }
    return { albums: result.albums };
  },
  loaderDeps,
  validateSearch: searchSchema,
});
