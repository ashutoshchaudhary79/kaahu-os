import { syncLatestSources, type SourceSyncOutcome } from "@/scripts/sync";

declare global {
  var kaahuStartupSync: Promise<SourceSyncOutcome[]> | undefined;
}

export function syncDashboardSources(): Promise<SourceSyncOutcome[]> {
  if (!globalThis.kaahuStartupSync) {
    globalThis.kaahuStartupSync = syncLatestSources().finally(() => {
      globalThis.kaahuStartupSync = undefined;
    });
  }
  return globalThis.kaahuStartupSync;
}
