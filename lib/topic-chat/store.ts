// Where 主題對話 keeps conversations, and the one place their ordering rules
// are enforced: a generation lands only if, at the moment it is written, its
// request is still pending, the chat still exists on the same topic version,
// and the message it answers is still the latest. "Stop", "switch topic",
// "end" and "delete" all work by making one of those false first, under the
// same row lock — so whichever the server sees first wins, whatever order the
// phone hears about them.

import type postgres from "postgres";
import type {
  ChatReview, ChatStatus, LearningDirection, MessageKind, RequestKind, RequestStatus,
} from "./contracts";

export interface ChatRow {
  id: string;
  userId: string;
  learningDirection: LearningDirection;
  topicId: string;
  topicVersion: number;
  status: ChatStatus;
  review: ChatReview | null;
  createdAt: Date;
  updatedAt: Date;
  answers: number;
  /** Points its replies took. */
  spent: number;
}

export interface MessageRow {
  id: string;
  kind: MessageKind;
  topicId: string;
  topicVersion: number;
  requestId: string;
  body: Record<string, unknown>;
  createdAt: Date;
}

/** The part of a message that says whether a 答法 was practised (./answers). */
export type AnswerMessage = Pick<MessageRow, "id" | "kind" | "topicVersion" | "body">;

export interface RequestRow {
  requestId: string;
  chatId: string;
  kind: RequestKind;
  status: RequestStatus;
  topicVersion: number;
  anchorMessageId: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: Date;
}

export type Begun =
  | { state: "started" }
  /** The same request id was sent before; this is what became of it. */
  | { state: "existing"; request: RequestRow }
  /** Another chat-changing generation is still pending. */
  | { state: "busy" };

export interface NewMessage {
  id: string;
  kind: MessageKind;
  body: Record<string, unknown>;
}

export interface Commit {
  requestId: string;
  chatId: string;
  messages: NewMessage[];
  /** 簡單一點: fields merged into the anchor message's body. */
  mergeIntoAnchor?: Record<string, unknown>;
  /** 回顧: stored on the chat. */
  review?: ChatReview;
  /** 幫我表達: kept on the request, so a resend reads it back. */
  result?: Record<string, unknown>;
}

export interface TopicChatStore {
  activeChat(userId: string, direction: LearningDirection): Promise<ChatRow | null>;
  listChats(userId: string, direction: LearningDirection, limit: number): Promise<ChatRow[]>;
  chat(userId: string, chatId: string): Promise<ChatRow | null>;
  chatCreatedBy(userId: string, requestId: string): Promise<ChatRow | null>;
  /** The latest `limit` messages, oldest first. */
  messages(chatId: string, limit: number): Promise<MessageRow[]>;
  /**
   * The latest `perChat` messages of the person's `chats` most recent *other*
   * conversations in this direction, newest conversation first and oldest
   * message first within each. Only the fields ./answers reads are selected,
   * because this runs on every turn and a body is large.
   */
  earlierChats(userId: string, direction: LearningDirection, exceptChatId: string,
    chats: number, perChat: number): Promise<AnswerMessage[][]>;
  /** The pending chat-changing generation, after expiring one a crashed run left behind. */
  pending(chatId: string): Promise<RequestRow | null>;
  request(chatId: string, requestId: string): Promise<RequestRow | null>;
  /** 幫我表達／簡單一點／換個問題 committed since the person last answered. */
  assistsSinceAnswer(chatId: string): Promise<number>;
  /**
   * Starts a conversation and ends the one that was active in that direction.
   * A resend of the same request id returns the chat it made.
   */
  createChat(input: {
    id: string; userId: string; direction: LearningDirection; topicId: string; requestId: string; divider: NewMessage;
  }): Promise<ChatRow>;
  /** New topic, new version, a divider; whatever was pending goes stale. Idempotent per request id. */
  switchTopic(input: { userId: string; chatId: string; topicId: string; requestId: string; divider: NewMessage }): Promise<ChatRow | null>;
  begin(input: {
    requestId: string; chatId: string; kind: RequestKind; topicVersion: number;
    anchorMessageId: string | null; payload: Record<string, unknown> | null;
  }): Promise<Begun>;
  commit(input: Commit): Promise<boolean>;
  fail(requestId: string): Promise<void>;
  stop(chatId: string, requestId: string): Promise<boolean>;
  addSpent(chatId: string, points: number): Promise<void>;
  endChat(userId: string, chatId: string): Promise<ChatRow | null>;
  deleteChat(userId: string, chatId: string): Promise<boolean>;
}

/** A run that crashed leaves its request pending; after this long it no longer blocks the chat. */
const PENDING_EXPIRY_SECONDS = 150;
const MAIN_KINDS = ["opening", "reply", "another", "simplify"];
/** Kinds that answer a specific AI message, which must still be the latest when they land. */
const ANCHORED_KINDS = ["reply", "another", "simplify"];

type Sql = postgres.Sql | postgres.TransactionSql;

const json = (value: unknown) => JSON.stringify(value);

function chatRow(row: postgres.Row): ChatRow {
  return {
    id: row.id, userId: row.user_id, learningDirection: row.learning_direction, topicId: row.topic_id,
    topicVersion: row.topic_version, status: row.status, review: row.review ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at, answers: Number(row.answers ?? 0),
    spent: Number(row.points_spent ?? 0),
  };
}

function requestRow(row: postgres.Row): RequestRow {
  return {
    requestId: row.request_id, chatId: row.chat_id, kind: row.kind, status: row.status,
    topicVersion: row.topic_version, anchorMessageId: row.anchor_message_id, payload: row.payload ?? null,
    result: row.result ?? null, createdAt: row.created_at,
  };
}

const ANSWERS = "(SELECT count(*) FROM topic_chat_messages m WHERE m.chat_id = c.id AND m.kind = 'user') AS answers";

export function createTopicChatStore(sql: postgres.Sql): TopicChatStore {
  async function chatById(db: Sql, userId: string, chatId: string): Promise<ChatRow | null> {
    const [row] = await db.unsafe(`SELECT c.*, ${ANSWERS} FROM topic_chats c WHERE c.id = $1 AND c.user_id = $2`, [chatId, userId]);
    return row ? chatRow(row) : null;
  }

  async function insertMessages(db: Sql, chatId: string, topicId: string, topicVersion: number, requestId: string, messages: NewMessage[]) {
    for (const m of messages) {
      await db`INSERT INTO topic_chat_messages (id, chat_id, kind, topic_id, topic_version, request_id, body)
        VALUES (${m.id}, ${chatId}, ${m.kind}, ${topicId}, ${topicVersion}, ${requestId}, ${json(m.body)}::text::jsonb)
        ON CONFLICT (chat_id, request_id, kind) DO NOTHING`;
    }
  }

  return {
    async activeChat(userId, direction) {
      const [row] = await sql.unsafe(`SELECT c.*, ${ANSWERS} FROM topic_chats c
        WHERE c.user_id = $1 AND c.learning_direction = $2 AND c.status = 'active'`, [userId, direction]);
      return row ? chatRow(row) : null;
    },

    async listChats(userId, direction, limit) {
      const rows = await sql.unsafe(`SELECT c.*, ${ANSWERS} FROM topic_chats c
        WHERE c.user_id = $1 AND c.learning_direction = $2 ORDER BY c.updated_at DESC LIMIT $3`, [userId, direction, limit]);
      return rows.map(chatRow);
    },

    chat: (userId, chatId) => chatById(sql, userId, chatId),

    async chatCreatedBy(userId, requestId) {
      const [row] = await sql.unsafe(`SELECT c.*, ${ANSWERS} FROM topic_chats c
        WHERE c.created_request_id = $1 AND c.user_id = $2`, [requestId, userId]);
      return row ? chatRow(row) : null;
    },

    async messages(chatId, limit) {
      const rows = await sql`SELECT * FROM (
          SELECT * FROM topic_chat_messages WHERE chat_id = ${chatId} ORDER BY seq DESC LIMIT ${limit}
        ) latest ORDER BY seq`;
      return rows.map(row => ({
        id: row.id, kind: row.kind, topicId: row.topic_id, topicVersion: row.topic_version,
        requestId: row.request_id, body: row.body, createdAt: row.created_at,
      }));
    },

    async earlierChats(userId, direction, exceptChatId, chats, perChat) {
      const rows = await sql`SELECT c.rank, m.id, m.kind, m.topic_version,
          m.body -> 'pattern' AS pattern, m.body ->> 'text' AS text, m.body -> 'support' AS support
        FROM (
          SELECT id, (row_number() OVER (ORDER BY updated_at DESC))::int AS rank FROM topic_chats
          WHERE user_id = ${userId} AND learning_direction = ${direction} AND id <> ${exceptChatId}
          ORDER BY updated_at DESC LIMIT ${chats}
        ) c
        JOIN LATERAL (
          SELECT id, kind, topic_version, body, seq FROM topic_chat_messages
          WHERE chat_id = c.id ORDER BY seq DESC LIMIT ${perChat}
        ) m ON true
        ORDER BY c.rank, m.seq`;
      const byChat = new Map<number, AnswerMessage[]>();
      for (const row of rows) {
        const body: Record<string, unknown> = {};
        if (row.pattern !== null) body.pattern = row.pattern;
        if (row.text !== null) body.text = row.text;
        if (row.support !== null) body.support = row.support;
        const message = { id: row.id, kind: row.kind, topicVersion: row.topic_version, body };
        const earlier = byChat.get(row.rank);
        if (earlier) earlier.push(message); else byChat.set(row.rank, [message]);
      }
      return [...byChat.values()];
    },

    async pending(chatId) {
      await sql`UPDATE topic_chat_requests SET status = 'failed', updated_at = now()
        WHERE chat_id = ${chatId} AND status = 'pending'
          AND created_at < now() - make_interval(secs => ${PENDING_EXPIRY_SECONDS})`;
      const [row] = await sql`SELECT * FROM topic_chat_requests
        WHERE chat_id = ${chatId} AND status = 'pending' AND kind IN ${sql(MAIN_KINDS)}`;
      return row ? requestRow(row) : null;
    },

    async request(chatId, requestId) {
      const [row] = await sql`SELECT * FROM topic_chat_requests WHERE request_id = ${requestId} AND chat_id = ${chatId}`;
      return row ? requestRow(row) : null;
    },

    async assistsSinceAnswer(chatId) {
      const [row] = await sql`SELECT count(*)::int AS n FROM topic_chat_requests r
        WHERE r.chat_id = ${chatId} AND r.status = 'committed' AND r.kind IN ('express', 'simplify', 'another')
          AND r.updated_at > coalesce(
            (SELECT max(created_at) FROM topic_chat_messages WHERE chat_id = ${chatId} AND kind = 'user'),
            '-infinity'::timestamptz)`;
      return row.n;
    },

    async createChat(input) {
      return sql.begin(async tx => {
        const existing = await tx`SELECT id FROM topic_chats WHERE created_request_id = ${input.requestId} AND user_id = ${input.userId}`;
        if (existing.length) return (await chatById(tx, input.userId, existing[0].id))!;
        // Starting over ends the conversation being continued, without a review.
        const ended = await tx`UPDATE topic_chats SET status = 'ended', ended_at = now(), updated_at = now()
          WHERE user_id = ${input.userId} AND learning_direction = ${input.direction} AND status = 'active'
          RETURNING id`;
        if (ended.length) {
          await tx`UPDATE topic_chat_requests SET status = 'stale', updated_at = now()
            WHERE chat_id IN ${tx(ended.map(row => row.id))} AND status = 'pending'`;
        }
        await tx`INSERT INTO topic_chats (id, user_id, learning_direction, topic_id, created_request_id)
          VALUES (${input.id}, ${input.userId}, ${input.direction}, ${input.topicId}, ${input.requestId})`;
        await insertMessages(tx, input.id, input.topicId, 1, input.requestId, [input.divider]);
        return (await chatById(tx, input.userId, input.id))!;
      });
    },

    async switchTopic(input) {
      return sql.begin(async tx => {
        const [chat] = await tx`SELECT * FROM topic_chats WHERE id = ${input.chatId} AND user_id = ${input.userId} FOR UPDATE`;
        if (!chat) return null;
        const done = await tx`SELECT 1 FROM topic_chat_messages
          WHERE chat_id = ${input.chatId} AND request_id = ${input.requestId} AND kind = 'topic'`;
        if (!done.length && chat.status === "active") {
          const version = chat.topic_version + 1;
          await tx`UPDATE topic_chat_requests SET status = 'stale', updated_at = now()
            WHERE chat_id = ${input.chatId} AND status = 'pending'`;
          await tx`UPDATE topic_chats SET topic_id = ${input.topicId}, topic_version = ${version}, updated_at = now()
            WHERE id = ${input.chatId}`;
          await insertMessages(tx, input.chatId, input.topicId, version, input.requestId, [input.divider]);
        }
        return chatById(tx, input.userId, input.chatId);
      });
    },

    async begin(input) {
      return sql.begin(async tx => {
        const [existing] = await tx`SELECT * FROM topic_chat_requests WHERE request_id = ${input.requestId} FOR UPDATE`;
        if (existing && (existing.chat_id !== input.chatId || existing.kind !== input.kind)) {
          return { state: "existing", request: { ...requestRow(existing), status: "stale" } } as const;
        }
        const retryable = existing && (existing.status === "failed" || existing.status === "stopped") &&
          existing.topic_version === input.topicVersion;
        if (existing && !retryable) return { state: "existing", request: requestRow(existing) } as const;
        await tx`UPDATE topic_chat_requests SET status = 'failed', updated_at = now()
          WHERE chat_id = ${input.chatId} AND status = 'pending'
            AND created_at < now() - make_interval(secs => ${PENDING_EXPIRY_SECONDS})`;
        try {
          await tx.savepoint(async sp => {
            if (existing) {
              await sp`UPDATE topic_chat_requests SET status = 'pending', created_at = now(), updated_at = now()
                WHERE request_id = ${input.requestId}`;
            } else {
              await sp`INSERT INTO topic_chat_requests
                (request_id, chat_id, kind, status, topic_version, anchor_message_id, payload)
                VALUES (${input.requestId}, ${input.chatId}, ${input.kind}, 'pending', ${input.topicVersion},
                  ${input.anchorMessageId}, ${input.payload === null ? null : json(input.payload)}::text::jsonb)`;
            }
          });
        } catch (error) {
          // The one-pending index: something else is being written in this chat.
          if ((error as { code?: string }).code === "23505") return { state: "busy" } as const;
          throw error;
        }
        return { state: "started" } as const;
      });
    },

    async commit(input) {
      return sql.begin(async tx => {
        const [chat] = await tx`SELECT * FROM topic_chats WHERE id = ${input.chatId} FOR UPDATE`;
        const [request] = await tx`SELECT * FROM topic_chat_requests WHERE request_id = ${input.requestId} FOR UPDATE`;
        if (!chat || !request || request.status !== "pending") return false;
        const isReview = request.kind === "review";
        let valid = isReview ? chat.status === "ended" : chat.status === "active" && chat.topic_version === request.topic_version;
        if (valid && ANCHORED_KINDS.includes(request.kind)) {
          const [latest] = await tx`SELECT id FROM topic_chat_messages
            WHERE chat_id = ${input.chatId} AND kind = 'ai' AND topic_version = ${chat.topic_version}
            ORDER BY seq DESC LIMIT 1`;
          valid = latest?.id === request.anchor_message_id;
        }
        if (!valid) {
          await tx`UPDATE topic_chat_requests SET status = 'stale', updated_at = now() WHERE request_id = ${input.requestId}`;
          return false;
        }
        await insertMessages(tx, input.chatId, chat.topic_id, chat.topic_version, input.requestId, input.messages);
        if (input.mergeIntoAnchor && request.anchor_message_id) {
          await tx`UPDATE topic_chat_messages SET body = body || ${json(input.mergeIntoAnchor)}::text::jsonb
            WHERE id = ${request.anchor_message_id} AND chat_id = ${input.chatId}`;
        }
        if (input.review) {
          await tx`UPDATE topic_chats SET review = ${json(input.review)}::text::jsonb WHERE id = ${input.chatId}`;
        }
        if (input.messages.length) await tx`UPDATE topic_chats SET updated_at = now() WHERE id = ${input.chatId}`;
        await tx`UPDATE topic_chat_requests SET status = 'committed', updated_at = now(),
          result = ${input.result === undefined ? null : json(input.result)}::text::jsonb
          WHERE request_id = ${input.requestId}`;
        return true;
      });
    },

    async fail(requestId) {
      await sql`UPDATE topic_chat_requests SET status = 'failed', updated_at = now()
        WHERE request_id = ${requestId} AND status = 'pending'`;
    },

    async stop(chatId, requestId) {
      const rows = await sql`UPDATE topic_chat_requests SET status = 'stopped', updated_at = now()
        WHERE request_id = ${requestId} AND chat_id = ${chatId} AND status = 'pending' RETURNING 1`;
      return rows.length > 0;
    },

    async addSpent(chatId, points) {
      await sql`UPDATE topic_chats SET points_spent = points_spent + ${points} WHERE id = ${chatId}`;
    },

    async endChat(userId, chatId) {
      return sql.begin(async tx => {
        const rows = await tx`UPDATE topic_chats SET status = 'ended', ended_at = coalesce(ended_at, now()), updated_at = now()
          WHERE id = ${chatId} AND user_id = ${userId} RETURNING id`;
        if (!rows.length) return null;
        await tx`UPDATE topic_chat_requests SET status = 'stale', updated_at = now()
          WHERE chat_id = ${chatId} AND status = 'pending' AND kind <> 'review'`;
        return chatById(tx, userId, chatId);
      });
    },

    async deleteChat(userId, chatId) {
      const rows = await sql`DELETE FROM topic_chats WHERE id = ${chatId} AND user_id = ${userId} RETURNING 1`;
      return rows.length > 0;
    },
  };
}
