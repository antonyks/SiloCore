# Session title persistence contract

`ChatSession.titleSource` records who owns the title: `PLACEHOLDER` for an
untouched default, `GENERATED` for an applied automatic title, or `USER` for a
supplied or explicitly renamed title. Session creation without a title now
stores `New Chat` as `PLACEHOLDER`; a supplied title, even `New Chat`, is
`USER`. Saving a title through the rename API also sets `USER`, including an
unchanged title. The database default remains `USER` for direct database
inserts. The migration classifies historical sessions titled
exactly `New Chat` as `PLACEHOLDER`; every other historical title remains
`USER`. A historical manual rename to `New Chat` cannot be distinguished from
an untouched default. Both title watermarks start null, so historical sessions
wait for a later successful reply before becoming eligible.

`latestEligibleAssistantMessageId` and `latestAttemptedAssistantMessageId` are
nullable session watermarks. `ChatMessage.triggeringUserMessageId` is a nullable
link from a generated assistant message to its triggering user message. These
are scalar IDs; title processing must verify the messages belong to the same
session and have the expected authors before using them. A partial session
index supports bounded scans for placeholder sessions with a newer eligible
reply. A partial job index supports active `chat.session_title` lookups by
workspace and `payload.sessionId`.

`GenerationUsage.operation` distinguishes `CHAT_REPLY` from `SESSION_TITLE`.
Its database default is `CHAT_REPLY`, classifying historical rows and existing
chat writes without changing usage totals. An `(operation, createdAt)` index
supports later operation-filtered analytics. This schema change does not
schedule title jobs, make title model calls, or change API response fields.

The migration is `backend/prisma/migrations/20261026000200_session_title_usage_schema`.
Under `instructions.txt`, the user applies it to the intended database and
regenerates the Prisma client before DB-backed tests or later tasks run.
