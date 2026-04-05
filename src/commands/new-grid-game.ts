import { InputFile } from "grammy";
import { CommandContext, Composer, Context } from "grammy";

import { redis } from "../config/redis";
import { CommandsHelper } from "../util/commands-helper";
import {
  generateWordSearch,
  getHint,
  selectWords,
} from "../util/word-search-generator";
import { generateGridImage } from "../util/word-search-image";
import { requireAllowedTopic, runGuards } from "../util/guards";
import { regularGameGuards } from "../util/guards";

export const GRID_GAME_DURATION_SECONDS = 120;
export const GRID_WORDS_COUNT = 10;

export const activeGridTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function gridKey(chatId: string | number, topicId: string): string {
  return `grid_game:${chatId}:${topicId}`;
}

export function buildWordList(
  placements: { word: string }[],
  foundWords: string[],
): string {
  return placements
    .map(({ word }) =>
      foundWords.includes(word)
        ? `✅  ${word}`
        : getHint(word),
    )
    .join("\n");
}

export function buildGridMessageLink(chatId: string, messageId: number): string {
  const cleanId = chatId.replace("-100", "");
  return `https://t.me/c/${cleanId}/${messageId}`;
}

export async function endGridGame(ctx: Context, key: string) {
  const raw = await redis.get(key);
  if (!raw) return;

  const gameState = JSON.parse(raw) as {
    foundWords: string[];
    scores: Record<string, number>;
    names: Record<string, string>;
    placements: { word: string }[];
  };

  await redis.del(key);

  const { scores, names, foundWords, placements } = gameState;

  const totalWords = placements.length;
  const foundCount = foundWords.length;

  if (foundCount === 0) {
    return ctx.reply(
      `<blockquote>⏱ <b>Time's Up!</b>\n\nNo words were found.\nThe words were:\n${placements.map((p) => p.word).join(", ")}</blockquote>\n\nStart a new game with /newgrid`,
      { parse_mode: "HTML" },
    );
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  const board = sorted
    .map(([userId, score], i) => {
      const name = names[userId] ?? "Unknown";
      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} <a href="tg://user?id=${userId}">${name}</a> — ${score} pts`;
    })
    .join("\n");

  await ctx.reply(
    `<blockquote>⏱ <b>Time's Up!</b>\n\n` +
      `Found <b>${foundCount}/${totalWords}</b> words\n\n` +
      `🏆 <b>Final Scores:</b>\n${board}</blockquote>\n\n` +
      `Start a new game with /newgrid`,
    { parse_mode: "HTML" },
  );
}

const composer = new Composer();

async function startGridGame(ctx: CommandContext<Context>) {
  if (!ctx.from || !ctx.chat) return;

  const topicId = ctx.msg.message_thread_id?.toString() || "general";
  const chatId = ctx.chat.id;

  const guard = await runGuards(ctx, regularGameGuards);
  if (!guard.ok) return ctx.reply(guard.message);

  const key = gridKey(chatId, topicId);
  const existing = await redis.get(key);

  if (existing) {
    return ctx.reply(
      "There is already a Word Grid game in progress. Use /endgrid to end it.",
    );
  }

  const words = selectWords(GRID_WORDS_COUNT);
  const { grid, placements } = generateWordSearch(words);

  const endsAt = Date.now() + GRID_GAME_DURATION_SECONDS * 1000;

  const gameState = {
    grid,
    placements,
    foundWords: [] as string[],
    scores: {} as Record<string, number>,
    names: {} as Record<string, string>,
    startedBy: ctx.from.id.toString(),
    endsAt,
    topicId,
    gridMessageId: 0,
  };

  const imageBuffer = await generateGridImage(grid, placements, []);
  const wordList = buildWordList(placements, []);

  const sentMessage = await ctx.replyWithPhoto(
    new InputFile(new Uint8Array(imageBuffer)),
    {
      caption:
        `🎮 <b>WORD GRID CHALLENGE</b> 🎮\n\n` +
        `<b>Find these words:</b>\n${wordList}\n\n` +
        `<i>Type the words you find to score points!</i>`,
      parse_mode: "HTML",
    },
  );

  gameState.gridMessageId = sentMessage.message_id;

  await redis.setex(
    key,
    GRID_GAME_DURATION_SECONDS + 10,
    JSON.stringify(gameState),
  );

  try {
    await ctx.api.pinChatMessage(chatId, sentMessage.message_id, {
      disable_notification: true,
    });
  } catch {}

  const timerId = setTimeout(async () => {
    activeGridTimers.delete(key);
    await endGridGame(ctx, key);
  }, GRID_GAME_DURATION_SECONDS * 1000);

  activeGridTimers.set(key, timerId);
}

composer.command("newgrid", (ctx) => startGridGame(ctx));

composer.command("endgrid", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;

  const guard = await runGuards(ctx, [requireAllowedTopic]);
  if (!guard.ok) return ctx.reply(guard.message);

  const topicId = ctx.msg.message_thread_id?.toString() || "general";
  const chatId = ctx.chat.id.toString();
  const key = gridKey(chatId, topicId);

  const existing = await redis.get(key);
  if (!existing) return ctx.reply("There is no Word Grid game in progress.");

  const userId = ctx.from.id.toString();
  const chatMember = await ctx.getChatMember(parseInt(userId));
  const gameState = JSON.parse(existing);

  const isAdmin =
    chatMember.status === "administrator" || chatMember.status === "creator";
  const isGameStarter = gameState.startedBy === userId;
  const isPrivate = ctx.chat.type === "private";

  if (!isAdmin && !isGameStarter && !isPrivate) {
    return ctx.reply("Only admins or the game starter can end the grid game.");
  }

  const timer = activeGridTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    activeGridTimers.delete(key);
  }

  await endGridGame(ctx, key);
});

CommandsHelper.addNewCommand("newgrid", "Start a new Word Grid game.");
CommandsHelper.addNewCommand(
  "endgrid",
  "End the current Word Grid game. Admins only in groups.",
);

export const newGridGameCommand = composer;
