import { InputFile } from "grammy";
import { Composer } from "grammy";

import z from "zod";

import {
  buildGridMessageLink,
  buildWordList,
  gridKey,
} from "../commands/new-grid-game";
import { redis } from "../config/redis";
import { WordPlacement } from "../util/word-search-generator";
import { generateGridImage } from "../util/word-search-image";
import { requireAllowedTopic, runGuards } from "../util/guards";

const composer = new Composer();

const gridGameSchema = z.object({
  grid: z.array(z.array(z.string())),
  placements: z.array(
    z.object({
      word: z.string(),
      startRow: z.number(),
      startCol: z.number(),
      dr: z.number(),
      dc: z.number(),
    }),
  ),
  foundWords: z.array(z.string()),
  scores: z.record(z.string(), z.number()),
  names: z.record(z.string(), z.string()),
  startedBy: z.string(),
  endsAt: z.number(),
  topicId: z.string(),
  gridMessageId: z.number(),
});

composer.on("message:text", async (ctx) => {
  const text = ctx.message.text?.trim().toUpperCase();
  if (!text || text.startsWith("/")) return;
  if (!/^[A-Z]+$/.test(text)) return;

  const chatId = ctx.chat.id;
  const chatIdStr = chatId.toString();
  const topicId = ctx.msg.message_thread_id?.toString() || "general";
  const key = gridKey(chatIdStr, topicId);

  const raw = await redis.get(key);
  if (!raw) return;

  const parsed = gridGameSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return;

  const gameState = parsed.data;

  const guard = await runGuards(ctx, [requireAllowedTopic]);
  if (!guard.ok) return;

  const matchedPlacement = gameState.placements.find(
    (p) => p.word === text,
  );

  if (!matchedPlacement) return;

  if (gameState.foundWords.includes(text)) {
    return ctx.reply(
      `<i>${text} was already found!</i>`,
      {
        parse_mode: "HTML",
        reply_parameters: { message_id: ctx.message.message_id },
      },
    );
  }

  const userId = ctx.from.id.toString();
  const userName =
    ctx.from.first_name + (ctx.from.last_name ? " " + ctx.from.last_name : "");
  const points = text.length;

  gameState.foundWords.push(text);
  gameState.scores[userId] = (gameState.scores[userId] ?? 0) + points;
  gameState.names[userId] = userName;

  const ttlMs = gameState.endsAt - Date.now();
  if (ttlMs <= 0) return;

  await redis.setex(
    key,
    Math.ceil(ttlMs / 1000) + 10,
    JSON.stringify(gameState),
  );

  // Update grid image with highlighted word
  const updatedImage = await generateGridImage(
    gameState.grid,
    gameState.placements as WordPlacement[],
    gameState.foundWords,
  );

  // Edit the original grid message photo
  try {
    await ctx.api.editMessageMedia(chatId, gameState.gridMessageId, {
      type: "photo",
      media: new InputFile(new Uint8Array(updatedImage)),
      caption:
        `🎮 <b>WORD GRID CHALLENGE</b> 🎮\n\n` +
        `<b>Find these words:</b>\n${buildWordList(gameState.placements, gameState.foundWords)}\n\n` +
        `<i>Type the words you find to score points!</i>`,
      parse_mode: "HTML",
    });
  } catch {}

  const gridLink = buildGridMessageLink(chatIdStr, gameState.gridMessageId);

  await ctx.reply(
    `🟢 <b>+${points} points</b> for <a href="tg://user?id=${ctx.from.id}">${userName}</a>! You found <b>${text}</b>.`,
    {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message.message_id },
      reply_markup: {
        inline_keyboard: [
          [{ text: "Go to Grid ➡️", url: gridLink }],
        ],
      },
    },
  );

  // Check if all words found
  const allFound = gameState.placements.every((p) =>
    gameState.foundWords.includes(p.word),
  );

  if (allFound) {
    const sorted = Object.entries(gameState.scores).sort(
      ([, a], [, b]) => b - a,
    );

    const board = sorted
      .map(([uid, score], i) => {
        const name = gameState.names[uid] ?? "Unknown";
        const medal =
          i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        return `${medal} <a href="tg://user?id=${uid}">${name}</a> — ${score} pts`;
      })
      .join("\n");

    await redis.del(key);

    await ctx.reply(
      `🎉 <b>All words found!</b>\n\n🏆 <b>Final Scores:</b>\n${board}\n\nStart a new game with /newgrid`,
      { parse_mode: "HTML" },
    );
  }
});

export const onGridMessageHandler = composer;
