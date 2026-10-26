/** App-scoped invalidation only: no cached data, write retries, or notifications. */
export type MutationDomain = "stock" | "sales";
export type AcceptedMutations = ReturnType<typeof createAcceptedMutations>;
export function createAcceptedMutations() {
  const readers = new Map<MutationDomain, Set<() => void | Promise<void>>>();
  return {
    subscribe(domain: MutationDomain, refresh: () => void | Promise<void>) {
      const listeners = readers.get(domain) ?? new Set();
      readers.set(domain, listeners);
      listeners.add(refresh);
      return () => { listeners.delete(refresh); };
    },
    accepted(domains: readonly MutationDomain[]) {
      const refreshes = new Set(domains.flatMap(domain => [...(readers.get(domain) ?? [])]));
      for (const refresh of refreshes) {
        // Read failure cannot turn an accepted write into failure or block other readers.
        try { void Promise.resolve(refresh()).catch(() => {}); } catch { /* Reader owns its unavailable state. */ }
      }
    },
  };
}
