import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { NotFound } from "#/components/organisms/NotFound/index.tsx";

import { routeTree } from "./routeTree.gen";

export const getRouter = () =>
  createTanStackRouter({
    defaultNotFoundComponent: NotFound,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    routeTree,
    scrollRestoration: true,
  });

declare module "@tanstack/react-router" {
  // eslint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
