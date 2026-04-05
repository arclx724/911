import { readFile } from "fs/promises";
import { join } from "path";

import sharp from "sharp";
import satori from "satori";

import { GRID_SIZE, WordPlacement, getWordCells } from "./word-search-generator";

const CELL_SIZE = 52;
const PADDING = 20;
const HEADER_HEIGHT = 50;

const FOUND_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#14b8a6",
];

export async function generateGridImage(
  grid: string[][],
  placements: WordPlacement[],
  foundWords: string[],
): Promise<Buffer> {
  const fontPath = join(process.cwd(), "src", "fonts", "roboto.ttf");
  const fontData = await readFile(fontPath);

  const highlightMap = new Map<string, string>();

  placements.forEach((placement, idx) => {
    if (!foundWords.includes(placement.word)) return;
    const color = FOUND_COLORS[idx % FOUND_COLORS.length]!;
    for (const [r, c] of getWordCells(placement)) {
      highlightMap.set(`${r},${c}`, color);
    }
  });

  const width = PADDING * 2 + GRID_SIZE * CELL_SIZE;
  const height = HEADER_HEIGHT + PADDING * 2 + GRID_SIZE * CELL_SIZE;

  const svg = await satori(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#1e2a3a",
        width: `${width}px`,
        height: `${height}px`,
        padding: `${PADDING}px`,
        fontFamily: "Roboto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: `${HEADER_HEIGHT}px`,
          background: "#ffffff",
          marginBottom: "12px",
          borderRadius: "4px",
        }}
      >
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#1e2a3a",
            letterSpacing: "4px",
          }}
        >
          WORD GRID
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "2px solid #4a9eda",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        {grid.map((row, rIdx) => (
          <div key={rIdx} style={{ display: "flex" }}>
            {row.map((letter, cIdx) => {
              const cellKey = `${rIdx},${cIdx}`;
              const bgColor = highlightMap.get(cellKey) ?? "transparent";
              const isHighlighted = highlightMap.has(cellKey);
              return (
                <div
                  key={cIdx}
                  style={{
                    width: `${CELL_SIZE}px`,
                    height: `${CELL_SIZE}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: bgColor,
                    borderRight:
                      cIdx < GRID_SIZE - 1 ? "1px solid #2d4a6a" : "none",
                    borderBottom:
                      rIdx < GRID_SIZE - 1 ? "1px solid #2d4a6a" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: isHighlighted ? "#ffffff" : "#c8d8e8",
                    }}
                  >
                    {letter}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    {
      width,
      height,
      fonts: [{ name: "Roboto", data: fontData, weight: 700, style: "normal" }],
    },
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}
