"use client";

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // We will *manually* decide when to refetch via getQueryData + fetchQuery,
      // so this can stay small – GC will clean unused queries.
      staleTime: 86400000 * 7, // 7 days
      retry: 3,
    },
  },
});
