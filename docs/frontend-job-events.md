# Frontend job event subscriptions

Workspace route components can use `useJobEventSubscription` from
`frontend/src/features/jobEvents/useJobEventSubscription.ts`. The hook registers
exact job types, durable statuses, an `onJob` callback, and an optional `onReady`
callback. Set `enabled: false` when a mounted feature does not need events.

```tsx
useJobEventSubscription({
  types: ["example.job_type"],
  statuses: ["SUCCEEDED", "FAILED"],
  onJob: ({ jobId, type, status }) => refreshRelevantData(jobId, type, status),
  onReady: () => refreshCurrentData(),
});
```

`WorkspaceRouteProvider` supplies one client for its validated workspace route.
The client opens one authenticated `fetch` SSE connection while at least one
registration exists. It combines registrations into the request filters and
reconnects when that union changes. Removing the last registration, leaving the
route, or switching workspaces closes the old stream. Admin routes have no job
event provider.

The feed carries only `jobId`, `type`, and `status`. A `job` callback should fetch
authoritative data from the feature's normal API. `onReady` runs when the stream
opens or reopens so features can reconcile changes that occurred while offline;
the feed does not replay every transition. A registration added to an already
ready stream also receives `onReady`.

The workspace chat page subscribes to terminal `chat.session_title` jobs. It
invalidates the workspace session list and selected-session detail on both a
terminal event and `ready`, so the sidebar and heading read the current title
from the chat API. Job events and results do not supply the displayed title.

The client uses the existing bearer token and validated `X-Workspace-Id` header.
Missing credentials or HTTP 401 for the current token use the existing logout
path. A 401 from a request sent with an older token reconnects with the current
token without logging out. Transient failures retry with bounded backoff;
other HTTP 4xx responses stop that filter set until the registrations or
workspace change. Feature callbacks are isolated so one
callback error does not stop other listeners.

Tests are in `frontend/test/jobEvents`. From `frontend/`, run `npm test`,
`npm run lint`, and `npm run build`.
