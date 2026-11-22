import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  client: {
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    VITE_GA_MEASUREMENT_ID: z.string().optional(),
    VITE_IMAGE_BASE_URL: z.url(),
    VITE_SITE_URL: z.url(),
  },

  clientPrefix: "VITE_",

  emptyStringAsUndefined: true,

  runtimeEnv: {
    ...import.meta.env,
    ...(typeof process === "undefined" ? {} : process.env),
  },

  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
  },
});
