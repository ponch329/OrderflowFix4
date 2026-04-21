/**
 * React Query hooks for orders.
 *
 * Use these in place of the manual useEffect+useState+axios pattern.
 * Benefits: automatic caching, background refetch on stale, instant
 * reads on navigation, built-in loading/error states.
 *
 * Usage:
 *   const { data, isLoading, refetch } = useOrders({ page: 1, folder: 'all' });
 *   const deleteMut = useBulkDeleteOrders();
 *   deleteMut.mutate({ order_ids: [...] }, { onSuccess: ... });
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import { queryClient, queryKeys, invalidateOrders } from "@/lib/queryClient";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useOrders(filters) {
  const { page = 1, limit = 40, folder = "all", search = "", sortField, sortDirection } = filters || {};
  return useQuery({
    queryKey: queryKeys.orders({ page, limit, folder, search, sortField, sortDirection }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (folder === "archived") {
        params.set("archived", "true");
      } else if (folder !== "all") {
        const [stage, status] = folder.split(":");
        if (stage) params.set("stage", stage);
        if (status) params.set("status", status);
      }
      if (search) params.set("search", search);
      if (sortField) params.set("sort_field", sortField);
      if (sortDirection) params.set("sort_direction", sortDirection);
      const res = await axios.get(`${API}/admin/orders?${params.toString()}`);
      return res.data;
    },
    keepPreviousData: true,
  });
}

export function useOrderCounts() {
  return useQuery({
    queryKey: queryKeys.orderCounts(),
    queryFn: async () => {
      const res = await axios.get(`${API}/admin/orders/counts`);
      return res.data;
    },
    staleTime: 60 * 1000, // counts change less frequently
  });
}

export function useOrder(orderId) {
  return useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: async () => {
      const res = await axios.get(`${API}/orders/${orderId}`);
      return res.data;
    },
    enabled: Boolean(orderId),
  });
}

export function useBulkDeleteOrders() {
  return useMutation({
    mutationFn: async (payload) => {
      const url = payload.order_ids
        ? `${API}/admin/orders/bulk-delete`
        : `${API}/admin/orders/bulk-delete-by-filter`;
      const res = await axios.post(url, { ...payload, confirm: true });
      return res.data;
    },
    onSuccess: () => invalidateOrders(),
  });
}

export function useBulkUpdateOrders() {
  return useMutation({
    mutationFn: async ({ order_ids, stage, status }) => {
      const res = await axios.post(`${API}/admin/orders/bulk-update`, { order_ids, stage, status });
      return res.data;
    },
    onSuccess: () => invalidateOrders(),
  });
}

export function useDeleteOrder() {
  return useMutation({
    mutationFn: async (orderId) => {
      const res = await axios.delete(`${API}/admin/orders/${orderId}`);
      return res.data;
    },
    onSuccess: (_, orderId) => {
      queryClient.removeQueries({ queryKey: queryKeys.order(orderId) });
      invalidateOrders();
    },
  });
}
