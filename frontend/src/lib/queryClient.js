import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client for the whole app.
 *
 * Tuned defaults for an admin dashboard:
 * - staleTime 30s: admins revisit pages often; avoid spam refetching
 * - gcTime 5min: keep cache while users navigate between pages
 * - retry once on network errors; no retry on 4xx
 * - refetchOnWindowFocus: false by default (opt-in per query when needed)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Invalidate all order-related queries. Call from mutations that change orders.
 */
export const invalidateOrders = () => {
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["orderCounts"] });
};

/**
 * Canonical query keys. Keep these centralised so invalidation is trivial.
 */
export const queryKeys = {
  orders: (filters = {}) => ["orders", filters],
  orderCounts: () => ["orderCounts"],
  order: (orderId) => ["order", orderId],
  workflowConfig: () => ["workflowConfig"],
  settings: () => ["settings"],
  users: () => ["users"],
};
