import { useState, type ReactNode } from "react";

import { Button, Group, Stack, Text, TextInput } from "@mantine/core";

import { VisibilityControl } from "#/components/molecules/VisibilityControl/index.tsx";

export type AlbumFormValues = {
  title: string;
  slug: string;
  periodStart: string;
  periodEnd: string;
  visibility: "public" | "private";
};

type AlbumFormProps = {
  initialValues?: AlbumFormValues;
  slugRequired?: boolean;
  slugDescription: string;
  requireDirty?: boolean;
  submitLabel: string;
  submitIcon: ReactNode;
  submitting: boolean;
  errorMessage: string | null;
  statusMessage?: string;
  onSubmit: (values: AlbumFormValues) => void;
};

export const AlbumForm = ({
  initialValues = { periodEnd: "", periodStart: "", slug: "", title: "", visibility: "private" },
  slugRequired = false,
  slugDescription,
  requireDirty = false,
  submitLabel,
  submitIcon,
  submitting,
  errorMessage,
  statusMessage,
  onSubmit,
}: AlbumFormProps) => {
  const [title, setTitle] = useState(initialValues.title);
  const [slug, setSlug] = useState(initialValues.slug);
  const [periodStart, setPeriodStart] = useState(initialValues.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialValues.periodEnd);
  const [visibility, setVisibility] = useState(initialValues.visibility);
  const dirty =
    title.trim() !== initialValues.title ||
    slug.trim() !== initialValues.slug ||
    periodStart !== initialValues.periodStart ||
    periodEnd !== initialValues.periodEnd ||
    visibility !== initialValues.visibility;
  const periodInvalid = periodEnd !== "" && (periodStart === "" || periodStart > periodEnd);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          periodEnd,
          periodStart,
          slug: slug.trim(),
          title: title.trim(),
          visibility,
        });
      }}
    >
      <Stack gap="md">
        <TextInput
          label="名前"
          required
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          maxLength={200}
        />
        <Group grow align="flex-start">
          <TextInput
            label="開始年月"
            type="month"
            placeholder="2026-05"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.currentTarget.value)}
          />
          <TextInput
            label="終了年月"
            type="month"
            placeholder="2026-05"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.currentTarget.value)}
            error={periodInvalid ? "終了年月は開始年月以降にしてください" : undefined}
          />
        </Group>
        <TextInput
          label="URL"
          description={slugDescription}
          required={slugRequired}
          value={slug}
          onChange={(e) => setSlug(e.currentTarget.value)}
          maxLength={200}
        />
        <VisibilityControl value={visibility} onChange={setVisibility} />
        {errorMessage && (
          <Text size="sm" c="red" role="alert">
            {errorMessage}
          </Text>
        )}
        <Group justify="flex-end" gap="sm">
          {statusMessage && (
            <Text size="sm" c="dimmed" role="status">
              {statusMessage}
            </Text>
          )}
          <Button
            type="submit"
            leftSection={submitIcon}
            loading={submitting}
            disabled={
              title.trim().length === 0 ||
              periodInvalid ||
              (slugRequired && slug.trim().length === 0) ||
              (requireDirty && !dirty)
            }
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
};
