import { useState } from "react";

import { Stack, Title } from "@mantine/core";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { AlbumForm, type AlbumFormValues } from "#/components/organisms/AlbumForm/index.tsx";
import { APP_NAME } from "#/lib/app.ts";
import { createAlbum } from "#/server/albums.ts";

const NewAlbumPage = () => {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (values: AlbumFormValues) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await createAlbum({
        data: {
          periodEnd: values.periodEnd || null,
          periodStart: values.periodStart || null,
          slug: values.slug || null,
          title: values.title,
          visibility: values.visibility,
        },
      });
      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }
      await router.navigate({ params: { slug: result.slug }, to: "/admin/albums/$slug" });
      await router.invalidate();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>新しいアルバム</Title>
      <AlbumForm
        slugDescription="公開ページのアドレスに使われます。英数字・ひらがな・カタカナ・漢字とハイフンが使えます。空欄の場合は名前から自動で作られます"
        submitLabel="作成する"
        submitIcon={<PlusIcon size={16} />}
        submitting={submitting}
        errorMessage={errorMessage}
        onSubmit={(values) => {
          handleSubmit(values);
        }}
      />
    </Stack>
  );
};

export const Route = createFileRoute("/admin/albums/new")({
  component: NewAlbumPage,
  head: () => ({ meta: [{ title: `新規アルバム | ${APP_NAME}` }] }),
});
