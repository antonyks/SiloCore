import { createContext, useContext } from "react";
import type { JobEventSubscriptionClient } from "./jobEventClient";

export const JobEventSubscriptionContext = createContext<JobEventSubscriptionClient | null>(null);

export function useJobEventSubscriptionClient(): JobEventSubscriptionClient {
  const client = useContext(JobEventSubscriptionContext);
  if (!client) throw new Error("JobEventSubscriptionProvider is required");
  return client;
}
