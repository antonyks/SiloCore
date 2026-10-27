import { useEffect, useState, type ReactNode } from "react";
import { JobEventSubscriptionClient } from "./jobEventClient";
import { JobEventSubscriptionContext } from "./jobEventContext";

export function JobEventSubscriptionProvider({
  workspaceId,
  children,
}: {
  workspaceId: number | null;
  children: ReactNode;
}) {
  const [client] = useState(() => new JobEventSubscriptionClient());

  useEffect(() => {
    client.setWorkspaceId(workspaceId);
    return () => client.setWorkspaceId(null);
  }, [client, workspaceId]);

  return (
    <JobEventSubscriptionContext.Provider value={client}>
      {children}
    </JobEventSubscriptionContext.Provider>
  );
}
