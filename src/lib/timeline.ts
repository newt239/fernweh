import * as z from "zod";

type TimelineSample = {
  at: number;
  latitude: number;
  longitude: number;
};

type TimelineVisit = {
  start: number;
  end: number;
  latitude: number;
  longitude: number;
};

export type Timeline = {
  samples: TimelineSample[];
  visits: TimelineVisit[];
};

type TimelineMatch = {
  latitude: number;
  longitude: number;
  diffMs: number;
  source: "visit" | "interpolated" | "nearest";
};

const placeSchema = z.union([z.string(), z.object({ latLng: z.string().optional() })]).optional();

const pathStepSchema = z
  .object({
    durationMinutesOffsetFromStartTime: z.string().optional(),
    point: z.string().optional(),
    time: z.string().optional(),
  })
  .catch({});

const segmentSchema = z
  .object({
    activity: z.object({ end: placeSchema, start: placeSchema }).optional(),
    endTime: z.string().optional(),
    startTime: z.string().optional(),
    timelinePath: z.array(pathStepSchema).optional(),
    visit: z
      .object({ topCandidate: z.object({ placeLocation: placeSchema }).optional() })
      .optional(),
  })
  .catch({});

const rawSignalSchema = z
  .object({
    position: z
      .object({
        LatLng: z.string().optional(),
        latLng: z.string().optional(),
        timestamp: z.string().optional(),
      })
      .optional(),
  })
  .catch({});

const timelineFileSchema = z.union([
  z.array(segmentSchema),
  z.object({
    rawSignals: z.array(rawSignalSchema).optional(),
    semanticSegments: z.array(segmentSchema).optional(),
  }),
]);

const readCoordinate = (
  value?: string | { latLng?: string },
): { latitude: number; longitude: number } | null => {
  const text = typeof value === "string" ? value : value?.latLng;
  if (!text) {
    return null;
  }
  const parts = text
    .replace("geo:", "")
    .replaceAll("°", "")
    .trim()
    .split(/[,\s]+/);
  if (parts.length < 2) {
    return null;
  }
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  if (latitude === 0 && longitude === 0) {
    return null;
  }
  return { latitude, longitude };
};

const toEpoch = (value?: string) => {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

export const parseTimeline = (text: string): Timeline => {
  const parsed = timelineFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error("タイムラインのデータ形式を判別できませんでした");
  }
  const segments = Array.isArray(parsed.data) ? parsed.data : (parsed.data.semanticSegments ?? []);
  const rawSignals = Array.isArray(parsed.data) ? [] : (parsed.data.rawSignals ?? []);

  const samples: TimelineSample[] = [];
  const visits: TimelineVisit[] = [];

  for (const segment of segments) {
    const start = toEpoch(segment.startTime);
    const end = toEpoch(segment.endTime);

    const visitPoint = readCoordinate(segment.visit?.topCandidate?.placeLocation);
    if (visitPoint && start !== null && end !== null) {
      visits.push({ end, latitude: visitPoint.latitude, longitude: visitPoint.longitude, start });
      samples.push(
        { at: start, latitude: visitPoint.latitude, longitude: visitPoint.longitude },
        { at: end, latitude: visitPoint.latitude, longitude: visitPoint.longitude },
      );
    }

    for (const step of segment.timelinePath ?? []) {
      const point = readCoordinate(step.point);
      const offsetMinutes = Number(step.durationMinutesOffsetFromStartTime);
      const at =
        toEpoch(step.time) ??
        (start !== null && Number.isFinite(offsetMinutes) ? start + offsetMinutes * 60_000 : null);
      if (point && at !== null) {
        samples.push({ at, latitude: point.latitude, longitude: point.longitude });
      }
    }

    const activityStart = readCoordinate(segment.activity?.start);
    if (activityStart && start !== null) {
      samples.push({
        at: start,
        latitude: activityStart.latitude,
        longitude: activityStart.longitude,
      });
    }
    const activityEnd = readCoordinate(segment.activity?.end);
    if (activityEnd && end !== null) {
      samples.push({ at: end, latitude: activityEnd.latitude, longitude: activityEnd.longitude });
    }
  }

  for (const signal of rawSignals) {
    const point = readCoordinate(signal.position?.LatLng ?? signal.position?.latLng);
    const at = toEpoch(signal.position?.timestamp);
    if (point && at !== null) {
      samples.push({ at, latitude: point.latitude, longitude: point.longitude });
    }
  }

  samples.sort((a, b) => a.at - b.at);
  visits.sort((a, b) => a.start - b.start);
  return { samples, visits };
};

export const matchTimeline = (
  timeline: Timeline,
  atMs: number,
  toleranceMs: number,
): TimelineMatch | null => {
  let visitLow = 0;
  let visitHigh = timeline.visits.length;
  while (visitLow < visitHigh) {
    const mid = Math.floor((visitLow + visitHigh) / 2);
    const candidate = timeline.visits[mid];
    if (candidate.start <= atMs) {
      visitLow = mid + 1;
    } else {
      visitHigh = mid;
    }
  }
  const visit = timeline.visits[visitLow - 1];
  if (visit && visit.end >= atMs) {
    return {
      diffMs: 0,
      latitude: visit.latitude,
      longitude: visit.longitude,
      source: "visit",
    };
  }

  let low = 0;
  let high = timeline.samples.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const sample = timeline.samples[mid];
    if (sample.at < atMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const next = timeline.samples[low] ?? null;
  const prev = low > 0 ? timeline.samples[low - 1] : null;
  const prevDiff = prev ? atMs - prev.at : Number.POSITIVE_INFINITY;
  const nextDiff = next ? next.at - atMs : Number.POSITIVE_INFINITY;

  if (prev && next && prevDiff <= toleranceMs && nextDiff <= toleranceMs) {
    const span = next.at - prev.at;
    const ratio = span > 0 ? (atMs - prev.at) / span : 0;
    return {
      diffMs: Math.min(prevDiff, nextDiff),
      latitude: prev.latitude + (next.latitude - prev.latitude) * ratio,
      longitude: prev.longitude + (next.longitude - prev.longitude) * ratio,
      source: "interpolated",
    };
  }
  if (prev && prevDiff <= toleranceMs) {
    return {
      diffMs: prevDiff,
      latitude: prev.latitude,
      longitude: prev.longitude,
      source: "nearest",
    };
  }
  if (next && nextDiff <= toleranceMs) {
    return {
      diffMs: nextDiff,
      latitude: next.latitude,
      longitude: next.longitude,
      source: "nearest",
    };
  }
  return null;
};
