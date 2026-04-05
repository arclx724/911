import { randomInt } from "crypto";

import commonFourWords from "../data/common-four.json";
import commonFiveWords from "../data/common-five.json";
import commonSixWords from "../data/common-six.json";

export const GRID_SIZE = 8;

export interface WordPlacement {
  word: string;
  startRow: number;
  startCol: number;
  dr: number;
  dc: number;
}

const LETTER_POOL =
  "AAABBBCCDDDEEEEEEFFFGGGHHHIIIIIJKKLLLLMMMNNNNOOOOPPQRRRRSSSSTTTTUUUVVWWXYYZ";

const DIRECTIONS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const WORD_POOL = [
  ...commonFourWords,
  ...commonFiveWords,
  ...commonSixWords,
].map((w) => w.toUpperCase());

export function selectWords(count: number = 10): string[] {
  const shuffled = [...WORD_POOL].sort(() => Math.random() - 0.5);
  const selected: string[] = [];

  for (const word of shuffled) {
    if (word.length >= 3 && word.length <= GRID_SIZE) {
      if (!selected.includes(word)) {
        selected.push(word);
        if (selected.length >= count) break;
      }
    }
  }

  return selected;
}

function canPlace(
  grid: string[][],
  word: string,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number,
): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = startRow + i * dr;
    const c = startCol + i * dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (grid[r][c] !== "" && grid[r][c] !== word[i]) return false;
  }
  return true;
}

function placeWord(
  grid: string[][],
  word: string,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number,
): void {
  for (let i = 0; i < word.length; i++) {
    grid[startRow + i * dr][startCol + i * dc] = word[i];
  }
}

function tryPlaceWord(
  grid: string[][],
  word: string,
): WordPlacement | null {
  const positions: [number, number, number, number][] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      for (const [dr, dc] of DIRECTIONS) {
        if (canPlace(grid, word, r, c, dr, dc)) {
          positions.push([r, c, dr, dc]);
        }
      }
    }
  }

  if (positions.length === 0) return null;

  const [startRow, startCol, dr, dc] =
    positions[randomInt(0, positions.length)];
  placeWord(grid, word, startRow, startCol, dr, dc);

  return { word, startRow, startCol, dr, dc };
}

export function generateWordSearch(words: string[]): {
  grid: string[][];
  placements: WordPlacement[];
} {
  const grid: string[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(""),
  );

  const placements: WordPlacement[] = [];

  for (const word of words) {
    const placement = tryPlaceWord(grid, word);
    if (placement) placements.push(placement);
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === "") {
        grid[r][c] = LETTER_POOL[randomInt(0, LETTER_POOL.length)];
      }
    }
  }

  return { grid, placements };
}

export function getHint(word: string): string {
  return `${word[0]}${"—".repeat(word.length - 1)}  (${word.length})`;
}

export function getWordCells(placement: WordPlacement): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < placement.word.length; i++) {
    cells.push([
      placement.startRow + i * placement.dr,
      placement.startCol + i * placement.dc,
    ]);
  }
  return cells;
}
