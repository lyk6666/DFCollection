// Run from this folder: node polygons_svg.js
// Requires: npm i d3

import fs from "fs";
import * as d3 from "d3";

// same rule as your app
function getPolygonSides(filterCount) {
  if (filterCount <= 3) return 3;
  return filterCount % 2 === 0 ? filterCount + 1 : filterCount;
}

function polygonPoints(sides, radius, cx, cy) {
  const angleStep = (2 * Math.PI) / sides;
  return Array.from({ length: sides }, (_, i) => {
    const a = i * angleStep - Math.PI / 2; // start at top
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  });
}

function polygonPath(points) {
  return d3.line()(points.concat([points[0]])); // close
}

// visual params
const SIZE = 256;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE * 0.35; // padding
const STROKE_W = Math.max(1, Math.round(SIZE * 0.015)); // ~5px
const DASH = `${(STROKE_W * 6) / 5} ${(STROKE_W * 9) / 5}`; // proportional dash

// colors 0..7 (same idea as interpolateReds)
const fillScale = d3.scaleSequential(d3.interpolateReds).domain([0, 7]).clamp(true);

// output dir
const OUT = "./out";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// make 0..7
for (let filterCount = 0; filterCount <= 7; filterCount++) {
  const sides = getPolygonSides(filterCount);
  const pts = polygonPoints(sides, R, CX, CY);
  const d = polygonPath(pts);
  const fill = fillScale(filterCount);

  // build per-edge lines, dashed when i >= filterCount
  let edgeLines = "";
  for (let i = 0; i < sides; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % sides];
    const dashed = i >= filterCount;
    edgeLines += `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="#333" stroke-width="${STROKE_W}" ${dashed ? `stroke-dasharray="${DASH}"` : ""} stroke-linecap="round" />\n`;
  }

  // only polygon fill + edges (no labels/background)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <path d="${d}" fill="${fill}" />
  ${edgeLines.trim()}
</svg>`;

  const file = `${OUT}/polygon_${filterCount}.svg`;
  fs.writeFileSync(file, svg, "utf8");
  console.log("✅ wrote", file);
}
