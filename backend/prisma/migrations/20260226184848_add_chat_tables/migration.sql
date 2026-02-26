-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "author" "MessageAuthor" NOT NULL DEFAULT 'USER',
    "metadata" JSONB DEFAULT '{}',
    "sessionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- CreateIndex
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
