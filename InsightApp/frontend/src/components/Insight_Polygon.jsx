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

// Generate a regular polygon path (same as FullView)
function createPolygonPath(sides, radius, cx, cy) {
  const angleStep = (2 * Math.PI) / sides;
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return [x, y];
  });
  return d3.line()(points.concat([points[0]]));
}

function getPolygonSides(filterCount) {
  if (filterCount <= 3) return 3;
  if (filterCount <= 5) return 5;
  return filterCount % 2 === 0 ? filterCount + 1 : filterCount;
}

// Utility functions (flattenSections, etc.) should still be defined outside this file or imported

function wrapTextToLines(text, maxWidth, fontSize = 14, fontFamily = "sans-serif") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontSize}px ${fontFamily}`;

  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth) {
      if (line) lines.push(line);
      line = words[i]; // start new line
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function lightenRGBColor(colorString, index, maxIndex) {
  const match = colorString.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/);
  if (!match) return "rgb(200, 200, 200)"; // fallback to gray if malformed

  let [r, g, b, a] = match.slice(1).map((v, i) => i < 3 ? Number(v) : v); // convert r/g/b to numbers

  const maxIncrement = Math.min(255 - r, 255 - g, 255 - b);
  const safeMaxIndex = Math.max(1, maxIndex); // avoid divide by zero
  const fadeRatio = (index + 1) / (safeMaxIndex + 2); // leave headroom
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

function interpolateColor(ratio, targetColor = [0, 123, 255], exponent = 3) {
  const [r2, g2, b2] = targetColor;
  const adjustedRatio = Math.pow(ratio, exponent); // makes transition steeper
  const r = Math.round(255 + adjustedRatio * (r2 - 255));
  const g = Math.round(255 + adjustedRatio * (g2 - 255));
  const b = Math.round(255 + adjustedRatio * (b2 - 255));
  return `rgb(${r}, ${g}, ${b})`;
}

function InsightPolygon({ width, height, collection, filterOrder, setFilterOrder, sectionData, onInsightClick, onLayoutReady, selectedInsight }) {
  const [valueSequences, setValueSequences] = useState({});
  const [polygonSections, setPolygonSections] = useState(null);

  const filterColors = [
    "rgba(140, 0, 0, 1)",    
    "rgba(140, 135, 0, 1)",    
    "rgba(0, 140, 9, 1)",    
    "rgba(0, 140, 128, 1)", 
    "rgba(0, 9, 140, 1)",   
    "rgba(140, 0, 121, 1)",
    "rgba(140, 0, 0, 1)"  
  ];


  // Responsive layout parameters
  const size = Math.min(width, height);
  const radius = size / 2 - size * 0.12;
  const sides = getPolygonSides(filterOrder.length);
  const centerX = width / 2;
  const centerY = height / 2;
  const angleStep = (2 * Math.PI) / sides;

  const fontSize = size * 0.025;
  const labelOffset = size * 0.08;
  const _baseRadius = size * 0.003;
  const _barWidth = size * 0.015;
  const _barGap = size * 0.004;
  const _maxBarHeight = size * 0.1;

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
    console.log("🧮 Insight counts by level and index-in-level:", result);
  }, [sectionData]);

  let lastFilteredIndex = -1;

  for (let i = 0; i < filterOrder.length; i++) {
    if (filterOrder[i]) {
      lastFilteredIndex = i;
    }
  }

  if (lastFilteredIndex <= 0) {
    // Do not draw arc
  }

  const arcCenter = [centerX, centerY];
  const arcRadius = size / 2 - 5;

  function angleBetween(center, point) {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    return Math.atan2(dy, dx);
  }

  function averageAngles(a, b) {
    const x = Math.cos(a) + Math.cos(b);
    const y = Math.sin(a) + Math.sin(b);
    return Math.atan2(y, x);
  }

  // First edge (index 0)
  const angle0 = angleBetween(arcCenter, points[0]);
  const angle1 = angleBetween(arcCenter, points[1]);
  const startAngle = averageAngles(angle0, angle1);

  // Last filtered edge:
  const angleLastA = angleBetween(arcCenter, points[lastFilteredIndex]);
  const angleLastB = angleBetween(arcCenter, points[(lastFilteredIndex + 1) % sides]);
  const endAngle = averageAngles(angleLastA, angleLastB);

  // Project both onto circle:
  const start = [
    centerX + arcRadius * Math.cos(startAngle),
    centerY + arcRadius * Math.sin(startAngle)
  ];
  const end = [
    centerX + arcRadius * Math.cos(endAngle),
    centerY + arcRadius * Math.sin(endAngle)
  ];

  function normalizeAngle(angle) {
    return (angle + 2 * Math.PI) % (2 * Math.PI);
  }

  const normStart = normalizeAngle(startAngle);
  const normEnd = normalizeAngle(endAngle);

  let angleDiff = normEnd - normStart;
  if (angleDiff < 0) angleDiff += 2 * Math.PI;

  const largeArcFlag = angleDiff < (Math.PI) ? 0 : 1;
  const sweepFlag = 1;

  const arcPath = `
    M ${start[0]} ${start[1]}
    A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${end[0]} ${end[1]}
  `;

  useEffect(() => {
    if (!polygonSections || !svgRef.current || !onLayoutReady) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const layout = [];

    flattenSections(polygonSections.segments).forEach(seg => {
      if (!seg._isLeaf || !Array.isArray(seg.insights)) return;

      const points = generateInsightPoints(seg.vertices, seg.insights.length);
      seg.insights.forEach((insight, i) => {
        const [x, y] = points[i];
        layout.push({
          ...insight,
          x: x + svgRect.left,
          y: y + svgRect.top
        });
      });
    });

    onLayoutReady(layout);
  }, [polygonSections, onLayoutReady]);


  const leafSegments = polygonSections?.segments
    ? flattenSections(polygonSections.segments).filter(seg => seg._isLeaf)
    : [];

  const maxInsightCount = Math.max(...leafSegments.map(seg => seg.insights?.length || 0), 1);

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerWidth(rect.width);
    }
  }, [collection]);  // 🔥 recompute when collection changes

  // Compute max count per edge for normalization
  const maxCountsPerEdge = Object.fromEntries(
    Object.entries(insightCounts).map(([levelStr, indexCounts]) => {
      const maxCount = Math.max(...Object.values(indexCounts), 1);
      return [levelStr, maxCount];
    })
  );

  // Step 1. Build color map from collection.measure_set
  const colorPalette = [
    "#ffcf33ff",  // yellow
    "#f781bf",  // pink
    "#66c2a5",   // teal
    "#e41a1c",  // red
    "#377eb8",  // blue
    "#4daf4a",  // green
    "#984ea3",  // purple
    "#ff7f00",  // orange
    "#a65628",  // brown
    "#999999",  // grey
  ];
  const uniqueMeasureKeys = (collection?.measure_set || []).map(item =>
    Array.isArray(item) ? item.join("|") : item
  );
  const colorMap = {};
  uniqueMeasureKeys.forEach((key, i) => {
    colorMap[key] = colorPalette[i % colorPalette.length];
  });


  const yAxisRefs = useRef([]);
  const xAxisRefs = useRef([]);
  useEffect(() => {
    const chartHeight = 80;
    const chartWidth = 60;

    points.forEach(([_, __], i) => {
      const counts = insightCounts[i] || {};
      if (!Object.values(counts).some(v => v > 0)) return;

      const data = Object.entries(counts).map(([level, count]) => ({
        name: `L${level}`,
        value: count,
      }));

      const maxCount = d3.max(data, d => d.value) || 1;

      const yScale = d3.scaleLinear()
        .domain([0, maxCount])
        .range([chartHeight, 0]);

      const xScale = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([0, chartWidth])
        .padding(0.1);

      const yAxis = d3.axisRight(yScale).ticks(4).tickSize(3).tickPadding(2);
      const xAxis = d3.axisBottom(xScale).tickSize(3).tickPadding(4);

      if (yAxisRefs.current[i]) {
        d3.select(yAxisRefs.current[i]).call(yAxis);
      }

      if (xAxisRefs.current[i]) {
        d3.select(xAxisRefs.current[i]).call(xAxis);
      }
    });
  }, [points, insightCounts]);


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

        {/* Draw circular arrow */}
        {/* {lastFilteredIndex > 0 && (
          <>
            <path
              id="arcPathId"
              d={arcPath}
              fill="none"
              stroke="lightgrey"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              opacity={0.5}
            />
            <text fontSize="12" fill="grey" textAnchor="middle" opacity={0.5}>
              <textPath href="#arcPathId" startOffset="50%">
                Explore Sequence. Click and Drag to Reorder.
              </textPath>
            </text>
          </>
        )} */}

        {/* Leaf polygons colored by insight count gradient */}
        {leafSegments.map(seg => {
          const count = seg.insights?.length || 0;
          const ratio = count / maxInsightCount;
          const fillColor = interpolateColor(ratio, [200, 200, 200]); // White → Blue

          return (
            <polygon
              key={seg.id}
              points={seg.vertices.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={fillColor}
              stroke="#aaa"
              strokeWidth={0.5}
              opacity={1}
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
                <circle
                  key={`${seg.id}-insight-${i}`}
                  cx={x}
                  cy={y}
                  r={baseRadius}
                  fill={fillColor}
                  stroke="black"
                  strokeWidth={0.5}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    const svgRect = svgRef.current.getBoundingClientRect();

                    const relativeX = x + svgRect.left;
                    const relativeY = y + svgRect.top;

                    onInsightClick?.({
                      ...insight,
                      position: { x: relativeX, y: relativeY }
                    });
                  }}
                />
              );
            });
          })}

          
        {selectedInsight && selectedInsight.position && (
          <circle
            cx={selectedInsight.position.x}
            cy={selectedInsight.position.y}
            r={6}
            stroke="red"
            strokeWidth={2}
            fill="none"
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

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

  let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;

  const nx = dy / length;
  const ny = -dx / length;
  const toCenterX = centerX - mx;
  const toCenterY = centerY - my;
  const inward = nx * toCenterX + ny * toCenterY < 0;
  const offsetX = mx + nx * labelOffset * 0;
  const offsetY = my + ny * labelOffset * 0;

  const counts = insightCounts[i] || {};
  if (!Object.values(counts).some(v => v > 0)) return null;

  const data = Object.entries(counts).map(([level, count]) => ({
    name: `L${level}`,
    value: count
  }));

  const maxCount = d3.max(data, d => d.value) || 1;

  const chartWidth = 60;
  const chartHeight = 80;
  const barPadding = 5;
  const barWidth = (chartWidth - barPadding * (data.length - 1)) / data.length;

  const yScale = d3.scaleLinear()
    .domain([0, maxCount])
    .range([chartHeight, 0]);

  return (
    <g
      key={`bar-${i}`}
      transform={`translate(${offsetX}, ${offsetY}) rotate(${angleDeg})`}
    >
      {/* Bars */}
      {data.map((d, index) => {
        const height = chartHeight - yScale(d.value);
        return (
          <rect
            key={index}
            x={index * (barWidth + barPadding)}
            y={yScale(d.value)}
            width={barWidth}
            height={height}
            fill={lightenRGBColor(filterColors[i % filterColors.length], index, data.length - 1)}
            stroke="white"
            strokeWidth={0.5}
          />
        );
      })}

      {/* D3 Axis group (right side) */}
      <g>
        <g
          className="y-axis"
          ref={el => (yAxisRefs.current[i] = el)}
          transform={`translate(${chartWidth}, 0)`}
        />
        <g
          className="x-axis"
          ref={el => (xAxisRefs.current[i] = el)}
          transform={`translate(0, ${chartHeight})`}
        />
      </g>
    </g>
  );
})}


        {/* Attribute + value sequence labels */}
        {points.map(([x1, y1], i) => {
          const attr = filterOrder[i];
          const color = attr ? filterColors[i % filterColors.length] : "#000";
          
          const [x2, y2] = points[(i + 1) % sides];
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const nx = -(dy / length);
          const ny = dx / length;

          let rawValues = valueSequences[attr] || [];

          if (Array.isArray(rawValues) && typeof rawValues[0] === "object" && rawValues[0].group) {
            rawValues = rawValues.map(groupObj => groupObj.group);
          }

          const indexedValues = rawValues.map((val, idx) => `${idx + 1}-${val}`);

          // Wrap logic: group indexed items by pixel width
          const fontSizeScaled = fontSize * 0.75;
          const edgeLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          const maxWidth = edgeLength * 0.75;
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.font = `${fontSizeScaled}px sans-serif`;

          const lines = [];
          let currentLine = [];

          indexedValues.forEach((word) => {
            const testLine = [...currentLine, word].join(", ");
            const { width } = ctx.measureText(testLine);
            if (width > maxWidth && currentLine.length > 0) {
              lines.push(currentLine);
              currentLine = [word];
            } else {
              currentLine.push(word);
            }
          });
          if (currentLine.length) lines.push(currentLine);

          const totalLines = 1 + lines.length;
          const labelDistanceMultiplier = 0.5 + totalLines * 0.2;

          // Step along the edge toward the first point (x1, y1)
          const edgeShiftRatio = 0.2;  // adjust this value to move more or less along the edge
          const shiftedX = mx * (1 - edgeShiftRatio) + x1 * edgeShiftRatio;
          const shiftedY = my * (1 - edgeShiftRatio) + y1 * edgeShiftRatio;

          // Now offset perpendicular to the edge as before
          const lx = shiftedX - nx * labelOffset * labelDistanceMultiplier;
          const ly = shiftedY - ny * labelOffset * labelDistanceMultiplier;

          const angleRaw = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
          let angle = angleRaw;
          if (angle > 90) angle -= 180;
          if (angle < -90) angle += 180;

          return (
            <g key={attr || i}>
              {attr && (
                <>
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${angle},${lx},${ly})`}
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
                    {/* Label */}
                    <tspan
                      x={lx}
                      dy={-lines.length * fontSize * 0.5}
                      fontSize={fontSize}
                      fontWeight="bold"
                      fill={color}
                    >
                      {attr}:
                    </tspan>

                    {/* Individually colored wrapped values */}
                    {lines.map((lineGroup, lineIdx) => (
                      <tspan key={lineIdx} x={lx} dy={fontSize} fontSize={fontSize * 0.6}>
                        {lineGroup.map((item, itemIdx) => {
                          const globalIdx =
                            lineGroup.slice(0, itemIdx).length +
                            lines.slice(0, lineIdx).reduce((sum, l) => sum + l.length, 0);
                          const fadedColor = globalIdx === 0 ? color : lightenRGBColor(color, globalIdx - 1, indexedValues.length - 2);
                          return (
                            <tspan key={itemIdx} fill={fadedColor}>
                              {item}{itemIdx < lineGroup.length - 1 ? ", " : ""}
                            </tspan>
                          );
                        })}
                      </tspan>
                    ))}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Embedded Color Legend in SVG */}
        {colorMap && (
          <g transform={`translate(${15}, ${15})`}>
            <rect x={-width*0.01} y={-height*0.005} width={size * 0.2} height={size * 0.04 * Object.keys(colorMap).length} fill="white" stroke="#ccc" />
            <text x={0} y={10} fontSize={size * 0.02} fontWeight="bold" fill="#333">Measure Legend:</text>
            {Object.entries(colorMap).map(([measureKey, color], i) => (
              <g key={measureKey} transform={`translate(-5, ${15 * (i + 1)})`}>
                <circle cx={6} cy={6} r={3} fill={color} stroke="#666" strokeWidth={0.5} />
                <text x={16} y={9} fontSize={size * 0.016} fill="#333">
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