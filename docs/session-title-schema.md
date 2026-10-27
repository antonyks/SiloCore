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
Its database default is `CHAT_REPLY`, classifying historical rows; chat writes
set that operation explicitly. Admin analytics keep chat reply totals in
`generation` and report title model calls separately in `titleGeneration`.
The same date window applies to both summaries. A `NOT_ENOUGH_CONTEXT` response
is a successful model call even though a later title job would apply no title.
The `(operation, createdAt)` index supports these filtered aggregates. The
worker now has a `chat.session_title` handler that reads eligible linked
exchanges, calls the reply's provider and model, records title-call usage, and
conditionally applies a safe generated title. Generated assistant messages
store their triggering user message ID. A complete successful reply with
nonblank content advances `latestEligibleAssistantMessageId` in the same
transaction as its assistant message, only while the title is a placeholder
and only if the new ID is greater. Partial, aborted, failed, reasoning-only,
and length-truncated replies do not advance it. Streaming replies also require
a provider completion marker; a clean EOF after partial output is a failed
reply. The title worker reads linked replies in bounded pages and skips
unsuccessful ones until it has up to three successful exchanges. Chat replies
do not enqueue title jobs or call the title model. The worker scheduler scans
eligible placeholder sessions in bounded batches, claims each session under a
PostgreSQL advisory lock, and advances the attempted watermark before enqueue.
It waits for the next eligible reply after insufficient context, enqueue
failure, or an exhausted title attempt. A nonterminal title job blocks a new
attempt for that session, even if another reply becomes eligible.

The migration is `backend/prisma/migrations/20261026000200_session_title_usage_schema`.
Under `instructions.txt`, the user applies it to the intended database and
regenerates the Prisma client before DB-backed tests or later tasks run.
