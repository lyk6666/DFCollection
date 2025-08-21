import React, { useState, useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

function flattenSections(sections, depth = 0) {
  const all = [];
  for (const seg of sections) {
    const isLeaf = !seg.children || seg.children.length === 0;
    all.push({ ...seg, _depth: depth, _isLeaf: isLeaf });
    if (!isLeaf) {
      all.push(...flattenSections(seg.children, depth + 1));
    }
  }
  return all;
}

function getCentroid(vertices) {
  let area = 0, cx = 0, cy = 0;

  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = vertices[i];
    const [x1, y1] = vertices[(i + 1) % n];
    const a = x0 * y1 - x1 * y0;
    area += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  area *= 0.5;
  if (Math.abs(area) < 1e-8) {
    // Degenerate (e.g. line or point), fall back to average
    const xs = vertices.map(([x]) => x);
    const ys = vertices.map(([, y]) => y);
    return [
      xs.reduce((a, b) => a + b, 0) / xs.length,
      ys.reduce((a, b) => a + b, 0) / ys.length
    ];
  }

  return [cx / (6 * area), cy / (6 * area)];
}

function scalePolygon(vertices, scale = 0.9) {
  if (!Array.isArray(vertices) || vertices.length < 3) return [];

  // Calculate centroid
  const [cx, cy] = getCentroid(vertices);

  // Scale each point toward the centroid
  return vertices.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * scale, cy + dy * scale];
  });
}

function generateInsightPoints(vertices, count) {
  const [cx, cy] = getCentroid(vertices);
  const polygon = scalePolygon(vertices, 0.6); // shrink polygon;

  if (count === 1) return [[cx, cy]];

  const baseRadiusStep = 0;
  const angleStep = (2 * Math.PI) / Math.max(count, 1);
  const maxRadiusStep = 30;
  const maxAngleTries = 50;

  const points = [];

  for (let i = 0; i < count; i++) {
    let angle = i * angleStep;
    let ring = Math.floor(i / 6 + 1);
    let radius = baseRadiusStep * ring;

    let x = cx + radius * Math.cos(angle);
    let y = cy + radius * Math.sin(angle);

    if (d3.polygonContains(polygon, [x, y])) {
      // ✅ Try to expand radius until no longer valid
      let best = [x, y];
      while (radius < maxRadiusStep) {
        const tryX = cx + radius * Math.cos(angle);
        const tryY = cy + radius * Math.sin(angle);
        if (d3.polygonContains(polygon, [tryX, tryY])) {
          best = [tryX, tryY];
          radius += 1;
        } else {
          break; // as soon as it leaves the polygon
        }
      }
      points.push(best);
    } else {
      // ❌ Not inside initially → try adjusting angle only
      let tries = 0;
      let found = false;
      while (tries < maxAngleTries) {
        angle += Math.PI / 24; // rotate by 10 degrees
        x = cx + radius * Math.cos(angle);
        y = cy + radius * Math.sin(angle);
        if (d3.polygonContains(polygon, [x, y])) {
          found = true;
          break;
        }
        tries++;
      }
      points.push(found ? [x, y] : [cx, cy]); // fallback to center if all else fails
    }
  }

  return points;
}

function getPolygonSides(filterCount) {
  if (filterCount <= 3) return 3;
  if (filterCount <= 5) return 5;
  return filterCount % 2 === 0 ? filterCount + 1 : filterCount;
}

function hexToRgbaStr(hex, alpha = 1) {
  if (!hex || typeof hex !== "string" || hex[0] !== '#') return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    // #RGB -> #RRGGBB
    h = h.split('').map(c => c + c).join('');
  } else if (h.length === 4) {
    // #RGBA -> expand
    h = h.split('').map(c => c + c).join('');
  }
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  // if 8-digit hex has alpha, use it (override param)
  if (h.length === 8) {
    const a = parseInt(h.slice(6, 8), 16) / 255;
    alpha = a;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenRGBColor(colorString, index, maxIndex) {
  // NEW: support hex input
  if (typeof colorString === "string" && colorString.startsWith("#")) {
    colorString = hexToRgbaStr(colorString);
  }

  const match = colorString.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/);
  if (!match) return "rgb(200, 200, 200)"; // fallback to gray if malformed

  let [r, g, b, a] = match.slice(1).map((v, i) => i < 3 ? Number(v) : v); // convert r/g/b to numbers
  const maxIncrement = Math.min(255 - r, 255 - g, 255 - b);
  const safeMaxIndex = Math.max(1, maxIndex);
  const fadeRatio = (index) / (safeMaxIndex + 1);
  const increment = Math.round(maxIncrement * fadeRatio);

  const newR = Math.min(255, r + increment);
  const newG = Math.min(255, g + increment);
  const newB = Math.min(255, b + increment);

  if (a !== undefined) {
    return `rgba(${newR}, ${newG}, ${newB}, ${a})`;
  } else {
    return `rgb(${newR}, ${newG}, ${newB})`;
  }
}

function aggregateInsightCountsByLevel(sectionData, level = 0, acc = {}) {
  if (!acc[level]) acc[level] = {};

  for (let i = 0; i < sectionData.length; i++) {
    const section = sectionData[i];
    const insightCount = Array.isArray(section.insights) ? section.insights.length : 0;

    // Aggregate by index in this level
    acc[level][i] = (acc[level][i] || 0) + insightCount;

    // Recurse into children if any
    if (Array.isArray(section.children) && section.children.length > 0) {
      aggregateInsightCountsByLevel(section.children, level + 1, acc);
    }
  }

  return acc;
}

function interpolateColor(
  ratio,
  startColor = [255, 255, 255],   // initial color
  targetColor = [0, 123, 255],     // final color
  exponent = 2
) {
  const [r1, g1, b1] = startColor;
  const [r2, g2, b2] = targetColor;

  const adjustedRatio = Math.pow(ratio, exponent); // steeper/shallower transition

  const r = Math.round(r1 + adjustedRatio * (r2 - r1));
  const g = Math.round(g1 + adjustedRatio * (g2 - g1));
  const b = Math.round(b1 + adjustedRatio * (b2 - b1));

  return `rgb(${r}, ${g}, ${b})`;
}

function getFittedFontSize(text, maxFontSize, barWidth, fontFamily = 'sans-serif') {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Start with max font size
  ctx.font = `${maxFontSize}px ${fontFamily}`;
  let textWidth = ctx.measureText(text).width;

  // If it already fits, return max
  if (textWidth <= barWidth) return maxFontSize;

  // Binary search to find optimal font size
  let min = 6;
  let max = maxFontSize;
  let bestFit = min;

  while (min <= max) {
    const mid = Math.floor((min + max) / 2);
    ctx.font = `${mid}px ${fontFamily}`;
    textWidth = ctx.measureText(text).width;

    if (textWidth <= barWidth) {
      bestFit = mid;
      min = mid + 1;
    } else {
      max = mid - 1;
    }
  }

  return bestFit;
}

function getValueLabelsFromSequence(sequence) {
  if (!Array.isArray(sequence)) return [];

  // Case 1: Grouped format — return array of group names only
  if (typeof sequence[0] === "object" && sequence[0] !== null && "group" in sequence[0]) {
    return sequence.map(groupObj => groupObj.group);
  }

  // Case 2: Already a flat array of strings — return as-is
  return sequence;
}


function InsightPolygon({ width, height, collection, filterOrder, setFilterOrder, sectionData, onInsightClick, selectedInsight }) {

  const [valueSequences, setValueSequences] = useState({});
  const [polygonSections, setPolygonSections] = useState(null);

  // Darken a hex color toward black by factor (0..1)
  function darkenHex(hex, factor = 0.6) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);

    const newR = Math.max(0, Math.floor(r * (1 - factor)));
    const newG = Math.max(0, Math.floor(g * (1 - factor)));
    const newB = Math.max(0, Math.floor(b * (1 - factor)));

    return `#${[newR,newG,newB].map(x => x.toString(16).padStart(2,'0')).join('')}`;
  }

  // Create a darker scheme from schemeCategory10
  const darkerSchemeCategory10 = d3.schemeCategory10.map(c => darkenHex(c, 0.25));

  const filterColors = darkerSchemeCategory10

  // Responsive layout parameters
  const size = Math.min(width, height);
  const radius = size / 2 - size * 0.12;
  const sides = getPolygonSides(filterOrder.length);
  const centerX = width / 2;
  const centerY = height / 2;
  const angleStep = (2 * Math.PI) / sides;

  const fontSize = size * 0.025;
  const _baseRadius = size * 0.004;

  const svgRef = useRef(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [insightCounts, setInsightCounts] = useState({});

  useEffect(() => {
    if (!sectionData) return;
    const counts = aggregateInsightCountsByLevel(sectionData);
    setInsightCounts(counts);
  }, [sectionData]);

  // Memoized polygon vertex points
  const points = useMemo(() => {
    return Array.from({ length: sides }, (_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      return [
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle)
      ];
    });
  }, [sides, radius, centerX, centerY]);

  // Fetch value sequence
  useEffect(() => {
    fetch("http://localhost:5000/api/value_sequence")
      .then(res => res.json())
      .then(data => setValueSequences(data))
      .catch(err => console.error("Error fetching value sequences:", err));
  }, []);

  // Fetch polygon sections
  useEffect(() => {
    if (!points.length || !sectionData) return;

    const payload = {
      polygon: points,
      section_data: sectionData,
      filter_sequence: filterOrder,
      filter_colors: filterOrder.map((_, i) => filterColors[i % filterColors.length])
    };

    console.log("Sending to /api/polygon_split:", payload);

    fetch("http://localhost:5000/api/polygon_split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => setPolygonSections(data))
      .catch(err => console.error("Error fetching polygon split:", err));
  }, [points, sectionData, filterOrder]);

  useEffect(() => {
    if (!sectionData) return;
    const result = aggregateInsightCountsByLevel(sectionData);
    console.log("Insight counts by level and index-in-level:", result);
  }, [sectionData]);

  const leafSegments = polygonSections?.segments
    ? flattenSections(polygonSections.segments).filter(seg => seg._isLeaf)
    : [];

  const maxInsightCount = Math.max(...leafSegments.map(seg => seg.insights?.length || 0), 1);

  const colorPalette = d3.schemeSet2;

  const uniqueMeasureKeys = (collection?.measure_set || []).map(item =>
    Array.isArray(item) ? item.join("|") : item
  );
  const colorMap = {};
  uniqueMeasureKeys.forEach((key, i) => {
    colorMap[key] = colorPalette[i % colorPalette.length];
  });

    const insightKey = (i) =>
    JSON.stringify({
      type: i?.type,
      breakdown: i?.breakdown,
      subspace: i?.subspace,
      measure: Array.isArray(i?.measure) ? [...i.measure].sort() : [i?.measure],
    });


  // ⛔ Hook declarations above ⛔ — now safe to return early
  if (!collection) return <div style={{ padding: 32 }}>Select a polygon to explore details.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <svg
        ref={svgRef}
        style={{
          width: width,
          height: height,
          background: "white",
          flexShrink: 0,
          border: "0px solid #ccc"  // 👈 Add this line
        }}
      >
        {/* Arrowhead marker definition */}
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth={size * 0.02} markerHeight={size * 0.02} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="lightgrey" />
          </marker>
        </defs>

        {/* Leaf polygons colored by insight count gradient */}
        {leafSegments.map(seg => {
          const count = seg.insights?.length || 0;
          const ratio = count / maxInsightCount;
          const fillColor = count? interpolateColor(ratio, [200, 200, 200], [0, 0, 0]) : "white";

          return (
            <polygon
              key={seg.id}
              points={seg.vertices.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={fillColor}
              stroke="#aaa"
              strokeWidth={0.5}
              opacity={0.25}
            />
          );
        })}

        {/* Insight points */}
        {polygonSections?.segments &&
          flattenSections(polygonSections.segments).map(seg => {
            if (!seg._isLeaf || !Array.isArray(seg.insights)) return null;
            const points = generateInsightPoints(seg.vertices, seg.insights.length);
            const baseRadius = _baseRadius;

            return points.map(([x, y], i) => {
              const insight = seg.insights[i];
              const rawValue = insight?.measure;

              // Step 3. Stringify measureValue if it's a list
              const key = Array.isArray(rawValue) ? rawValue.join("|") : rawValue;

              // Step 4. Lookup color
              const fillColor = colorMap[key] || "#ccc";  // fallback color

              return (
                <g key={`${seg.id}-insight-${i}`}>
                  {/* base dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={baseRadius}
                    fill={fillColor}
                    stroke="black"
                    strokeWidth={0.5}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      onInsightClick?.(insight)
                      console.log("Clicked insight in Polygon:", insight);
                    }}
                  />

                  {/* highlight ring if selected */}
                  {selectedInsight && insightKey(selectedInsight) === insightKey(insight) && (
                    <circle
                      cx={x}
                      cy={y}
                      r={baseRadius * 6}
                      fill="none"
                      stroke="red"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );

            });
          })}

        {/* Split lines with level-based fading */}
        {polygonSections?.split_lines
          ?.sort((a, b) => b.level - a.level)  // lower level (shallower) drawn last (on top)
          .map((line, i) => {
            const { color, level, index_in_level, coordinates } = line;
            const maxIndex = polygonSections.split_lines
              .filter(l => l.level === level)
              .reduce((max, l) => Math.max(max, l.index_in_level ?? 0), 0);

            const fadedColor = lightenRGBColor(color, index_in_level, maxIndex);

            return (
              <line
                key={`cut-${i}`}
                x1={coordinates[0][0]}
                y1={coordinates[0][1]}
                x2={coordinates[1][0]}
                y2={coordinates[1][1]}
                stroke={fadedColor}
                strokeWidth={2}
                opacity={0.9}
              />
            );
          })}


        {/* Colored sides with dashed fallback */}
        {points.map(([x1, y1], i) => {
          const [x2, y2] = points[(i + 1) % sides];
          const hasFilter = !!filterOrder[i];
          const color = hasFilter ? filterColors[i % filterColors.length] : "#000";

          return (
            <line
              key={`side-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={3}
              strokeDasharray={hasFilter ? null : "8 8"} // ← dashed line if no filter
              style={{ pointerEvents: "none" }}
            />
          );
        })}

        {/* barchart part */}
        {points.map(([x1, y1], i) => {
          const [x2, y2] = points[(i + 1) % sides];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;

          const tx = dx / length;            // Tangent vector
          const ty = dy / length;
          const nx = dy / length;            // Normal vector
          const ny = -dx / length;


          const counts = insightCounts[i] || {};
          if (!Object.values(counts).some(v => v > 0)) return null;

          const data = Object.entries(counts).map(([level, count]) => ({
            name: `L${level}`,
            value: count
          }));

          const maxCount = d3.max(data, d => d.value) || 1;
          const chartWidth = length * (data.length - 1) / data.length;
          const chartHeight = length * 0.2;

          const barWidth = chartWidth / (1.5 * data.length);
          const barPadding = (chartWidth - barWidth * data.length) / (data.length - 1);

          let flip = 1
          let flipLabel = 1;
          let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angleDeg > 90 || angleDeg < -90) {
            // angleDeg += 180;
            // flip = -1;
            flipLabel = -1
          } 

          let edgeOffset = 0
          let normOffset = chartHeight * 0.6;

          const offsetX = mx - flip * tx * (chartWidth / 2) + flip * nx * (chartHeight / 2) - edgeOffset * tx + normOffset * nx;
          const offsetY = my - flip * ty * (chartWidth / 2) + flip *  ny * (chartHeight / 2) - edgeOffset * ty + normOffset * ny;


          const yScale = d3.scaleLinear()
            .domain([0, maxCount])
            .range([chartHeight, 0]);

          const valueLabels = getValueLabelsFromSequence(valueSequences?.[filterOrder[i]]);
          // console.log("Value labels:", valueLabels);  

          return (
            <g
              key={`bar-${i}`}
              transform={`translate(${offsetX}, ${offsetY}) rotate(${angleDeg})`}
            >
              {/* Bars */}
              {data.map((d, index) => {
                const height = chartHeight - yScale(d.value);
                return (
                  <g key={index}>
                    {/* Bar */}
                    <rect
                      x={index * (barWidth + barPadding)}
                      y={yScale(d.value)}
                      width={barWidth}
                      height={height}
                      fill={lightenRGBColor(filterColors[i % filterColors.length], index, data.length - 1)}
                      // stroke="grey"
                      // strokeWidth={0.5}
                      rx={1} // horizontal corner radius
                      ry={1} // vertical corner radius (optional; if omitted, equals rx)
                    />

                    <text
                      x={index * (barWidth + barPadding) + barWidth / 2}
                      y={yScale(d.value) - chartHeight * 0.3 * flipLabel}
                      fontSize={length * 0.03}
                      transform={flipLabel === -1
                        ? `rotate(180, ${index * (barWidth + barPadding) + barWidth / 2}, ${yScale(d.value) + chartHeight * 0.08 * flipLabel})`
                        : undefined
                      }
                      fill="#c0c0c0ff"
                      textAnchor="middle"
                      dominantBaseline="baseline"
                    >
                      {d.value}
                    </text>

                    {/* Value sequence label above bar */}
                    <text
                      x={index * (barWidth + barPadding) + barWidth / 2}
                      y={yScale(d.value) - chartHeight * 0.1 * flipLabel}
                      fontSize={getFittedFontSize(
                        valueLabels?.[index] ?? `L${index + 1}`,
                        Math.min(barWidth * 1, 9),
                        chartWidth / data.length
                      )}
                      transform={flipLabel === -1
                        ? `rotate(180, ${index * (barWidth + barPadding) + barWidth / 2}, ${yScale(d.value) + chartHeight * 0.06 * flipLabel})`
                        : undefined
                      }
                      fill={lightenRGBColor(filterColors[i % filterColors.length], index, data.length - 1)}
                      textAnchor="middle"
                      dominantBaseline="baseline"
                    >
                      {valueLabels?.[index] ?? `L${index + 1}`}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}


      {/* Attribute */}
      {points.map(([x1, y1], i) => {
        const attr = filterOrder[i];
        const color = attr ? filterColors[i % filterColors.length] : "#000";

        const [x2, y2] = points[(i + 1) % sides];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        const nx = -(dy / length);
        const ny = dx / length;

        const lx = mx - nx * length * 0.35;
        const ly = my - ny * length * 0.35;

        const angleRaw = Math.atan2(dy, dx) * (180 / Math.PI);
        let angle = angleRaw;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;

        return (
          <g key={attr || i}>
            {attr && (
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${angle},${lx},${ly})`}
                fontSize={fontSize}
                fontWeight="bold"
                fill={color}
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                  opacity: draggedIndex === i ? 0.4 : 1,
                }}
                onClick={() => {
                  if (draggedIndex === null) {
                    setDraggedIndex(i);
                  } else {
                    setDraggedIndex(null);
                  }
                }}
                onMouseEnter={() => {
                  if (draggedIndex === null || draggedIndex === i) return;

                  const newOrder = [...filterOrder];
                  const draggedItem = newOrder.splice(draggedIndex, 1)[0];
                  newOrder.splice(i, 0, draggedItem);
                  setFilterOrder(newOrder);
                  setDraggedIndex(i);
                }}
              >
                {attr}
              </text>
            )}
          </g>
        );
      })}


      {/* Embedded Color Legend in SVG */}
      {colorMap && (
        <g transform={`translate(${size * 0.02}, ${size * 0.02})`}>
          <text
            x={size * 0.01}
            y={size * 0.025}
            fontSize={size * 0.02}
            fontWeight="bold"
            fill="#333"
          >
            Measure Legend:
          </text>
          {Object.entries(colorMap).map(([measureKey, color], i) => (
            <g 
              key={measureKey} 
              transform={`translate(${size * 0.02}, ${size * 0.015 + (i + 1) * size * 0.03})`}
            >
              <circle 
                r={size * 0.005} 
                fill={color} 
                stroke="#666" 
                strokeWidth={0.5}
             />
              <text 
                x={size * 0.025} 
                y={size * 0.005} 
                fontSize={size * 0.015} 
                fill="#333"
              >
                {measureKey.replace(/\|/g, ", ")}
              </text>
            </g>
          ))}
        </g>
      )}
      </svg>
      
    </div>
  );
}

export default InsightPolygon;