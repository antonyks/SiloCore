import { useEffect, useRef } from "react";
import { useJobEventSubscriptionClient } from "./jobEventContext";
import type { JobEventRegistration } from "./jobEventClient";

export function useJobEventSubscription({
  types,
  statuses,
  onJob,
  onReady,
  enabled = true,
}: JobEventRegistration & { enabled?: boolean }): void {
  const client = useJobEventSubscriptionClient();
  const callbacks = useRef({ onJob, onReady });
  useEffect(() => {
    callbacks.current = { onJob, onReady };
  }, [onJob, onReady]);

  const typesKey = JSON.stringify([...new Set(types)].sort());
  const statusesKey = JSON.stringify([...new Set(statuses)].sort());

  useEffect(() => {
    if (!enabled) return;
    return client.register({
      types: JSON.parse(typesKey) as string[],
      statuses: JSON.parse(statusesKey) as JobEventRegistration["statuses"],
      onJob: (event) => callbacks.current.onJob(event),
      onReady: () => callbacks.current.onReady?.(),
    });
  }, [client, enabled, typesKey, statusesKey]);
}
