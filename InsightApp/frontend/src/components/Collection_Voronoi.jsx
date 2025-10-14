import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { Delaunay } from "d3-delaunay"; // ✅ Required for Voronoi

// Generate a regular polygon path
function createPolygonPath(sides, radius, cx, cy) {
  const angleStep = (2 * Math.PI) / sides;
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return [x, y];
  });
  return d3.line()(points.concat([points[0]])); // close the path
}

// Determine number of polygon sides from filter count
function getPolygonSides(filterCount) {
  if (filterCount <= 3) return 3;
  return filterCount % 2 === 0 ? filterCount + 1 : filterCount;
}

function getValueLabelsFromSequence(sequence) {
  if (!Array.isArray(sequence)) return [];
  if (typeof sequence[0] === "object" && sequence[0] !== null && "group" in sequence[0]) {
    return sequence.map(g => g.group);
  }
  return sequence;
}

function buildDefaultOrder(attrs = [], valueSequences) {
  if (!attrs || !attrs.length || !valueSequences) return attrs || [];
  const countFor = (attr) => {
    const labels = getValueLabelsFromSequence(valueSequences?.[attr]);
    return Array.isArray(labels) ? labels.length : 0;
  };
  // many → few
  return [...attrs].sort((a, b) => countFor(b) - countFor(a));
}

function CollectionVoronoi({
  width,
  height,
  data,
  setSelectedCollection,
  setFilterOrder,
  selectedFilter,
  selectedCollection,
  history,
  valueSequences
}) {
  const ref = useRef();

  const [selectedCols, setSelectedCols] = useState([]); 
  const [appliedCols, setAppliedCols]   = useState([]); 

  // Build list of available columns from valueSequences
  const allColumns = useMemo(() => {
    if (!valueSequences) return [];
    return Object.keys(valueSequences).sort();
  }, [valueSequences]);

  const actionButtonStyle = {
    padding: "6px 12px",
    fontSize: 12,
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#f9fafb",
    cursor: "pointer",
    color: "#111",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  };

  function toggleCol(col) {
    setSelectedCols(prev => prev.includes(col)
      ? prev.filter(c => c !== col)
      : [...prev, col]
    );
  }
  function applyCombo() {
    setAppliedCols(selectedCols.slice());
  }
  function clearCombo() {
    setSelectedCols([]);
    setAppliedCols([]);
  }

  // Check if a collection contains ALL selected columns
  function passesCombination(collection, cols) {
    if (!cols || cols.length === 0) return true; // nothing applied
    const set = new Set(collection?.filter_set || []);
    return cols.every(c => set.has(c));
  }

  // Other filters (score/type/filter_count/filter_specified)
  function passesFilter(collection, selectedFilter) {
    if (!selectedFilter) return true;

    switch (selectedFilter.type) {
      case "score": {
        const score = collection.total_score ?? 0;
        const { min, max } = selectedFilter;
        return score >= min && score < max;
      }
      case "type_count": {
        const typeCount = new Set(collection.insights.map(ins => ins.type)).size;
        return typeCount === Number(selectedFilter.value);
      }
      case "filter_count": {
        const filterCount = collection.filter_set?.length ?? 0;
        return filterCount === Number(selectedFilter.count);
      }
      case "filter_specified": {
        return collection.filter_set?.includes(selectedFilter.filter);
      }
      default:
        return true;
    }
  }

  // 🆕 Map: collectionId -> first-seen sequence (1-based)
  const seqByCollection = useMemo(() => {
    const m = new Map();
    const total = history.length;

    history.forEach((h, i) => {
      const id = h?.collection?.id;
      if (id != null && !m.has(id)) {
        // Oldest = 1, Newest = total
        m.set(id, total - i);
      }
    });

    return m;
  }, [history]);


  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    // Dimensions for centered square canvas
    const PADDING = 0;
    const squareWidth = width - 2 * PADDING;
    const squareHeight = height * 0.7 - 2 * PADDING;
    const offsetX = 0;
    const offsetY = 0;

    // Full SVG background
    svg.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "white");

    // Inner square canvas background
    svg.append("rect")
      .attr("x", offsetX)
      .attr("y", offsetY)
      .attr("width", squareWidth)
      .attr("height", squareHeight)
      .attr("fill", "#f9f9f9")
      .attr("stroke", "#ccc");

    // Group inside inner canvas
    const innerGroup = svg.append("g").attr("transform", `translate(${offsetX}, ${offsetY})`);

    // helper: restrict an interpolator to a subrange [t0, t1]
    function subInterpolator(interpolator, t0 = 0.3, t1 = 0.8) {
      return t => interpolator(t0 + t * (t1 - t0));
    }

    // (A) Filter-count colors for POLYGONS (Reds)
    const uniqueFilterCounts = Array.from(
      new Set(data.map(d => d.filter_set?.length || 0))
    ).sort((a, b) => a - b);

    const filterExtent = d3.extent(uniqueFilterCounts); // [min, max]
    const filterDomain =
      filterExtent[0] === filterExtent[1]
        ? [filterExtent[0] - 1, filterExtent[1] + 1]
        : filterExtent;

    const colorScale = d3
      .scaleSequential(subInterpolator(d3.interpolateReds, 0.05, 0.6))
      .domain(filterDomain)
      .clamp(true);

    // (B) Type-count colors for VORONOI CELLS (Blues)
    const typeCounts = data.map(d => {
      const uniqueTypes = new Set((d.insights || []).map(ins => ins.type ?? "Unknown"));
      return uniqueTypes.size;
    });
    const uniqueTypeCounts = Array.from(new Set(typeCounts)).sort((a, b) => a - b);

    const typeExtent = d3.extent(uniqueTypeCounts);
    const typeDomain =
      typeExtent[0] === typeExtent[1]
        ? [typeExtent[0] - 1, typeExtent[1] + 1]
        : typeExtent;

    const typeColorScale = d3
      .scaleSequential(subInterpolator(d3.interpolateBlues, 0.05, 0.6))
      .domain(typeDomain)
      .clamp(true);

    // 🟦 Collect positions for Voronoi
    const positions = data.map(d => [
      d.position.x * squareWidth,
      d.position.y * squareHeight
    ]);

    // 🟨 Voronoi setup
    const delaunay = Delaunay.from(positions);
    const voronoi = delaunay.voronoi([0, 0, squareWidth, squareHeight]);

    const edgesGroup = svg.append("g").attr("class", "voronoi-edges");

    for (let i = 0; i < positions.length; i++) {
      const cell = voronoi.cellPolygon(i);
      if (!cell) continue;

      for (let j = 0; j < cell.length - 1; j++) {
        const [x1, y1] = cell[j];
        const [x2, y2] = cell[j + 1];

        edgesGroup.append("line")
          .attr("x1", x1)
          .attr("y1", y1)
          .attr("x2", x2)
          .attr("y2", y2)
          .attr("stroke", "#000")
          .attr("stroke-width", 0.5)
          .attr("stroke-opacity", 0.3);
      }
    }

    // 🟦 Voronoi cells filled by TYPE COUNT (schemeBlues)
    for (let i = 0; i < data.length; i++) {
      const collection = data[i];
      const uniqueTypes = new Set((collection.insights || []).map(ins => ins.type ?? "Unknown"));
      const typeCount = uniqueTypes.size;

      const match =
        passesFilter(collection, selectedFilter) &&
        passesCombination(collection, appliedCols);

      const fillColor = match ? typeColorScale(typeCount) : "#ccc";

      innerGroup.append("path")
        .attr("d", voronoi.renderCell(i))
        .attr("fill", fillColor)
        .attr("pointer-events", "none");
    }

    // 🟥 Polygons filled by FILTER COUNT (schemeReds)
    data.forEach((collection) => {
      if (!collection || !Array.isArray(collection.filter_set) || !collection.position) {
        console.warn("Skipping invalid collection:", collection);
        return;
      }

      const filterCount = collection.filter_set.length;
      const sides = getPolygonSides(filterCount);
      const color = colorScale(filterCount);  // 🎯 same filter count = same color

      // ✅ include combo here too
      const match =
        passesFilter(collection, selectedFilter) &&
        passesCombination(collection, appliedCols);

      const finalColor = match ? color : "#ccc";

      const scaledRadius = collection.position.r * Math.min(squareHeight, squareWidth) * 0.8;
      
      const scaledX = collection.position.x * squareWidth;
      const scaledY = collection.position.y * squareHeight;

      const angleStep = (2 * Math.PI) / sides;
      const points = Array.from({ length: sides }, (_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const x = scaledX + scaledRadius * Math.cos(angle);
        const y = scaledY + scaledRadius * Math.sin(angle);
        return [x, y];
      });

      // Draw the filled polygon background
      innerGroup.append("path")
        .attr("d", createPolygonPath(points.length, scaledRadius, scaledX, scaledY))
        .attr("fill", finalColor)
        .attr("stroke", "none")
        .attr("fill-opacity", match ? 1 : 0.35);

      // Draw each side as a line
      points.forEach((start, i) => {
        const end = points[(i + 1) % points.length];

        const hasFilter = i < collection.filter_set.length;

        innerGroup.append("line")
          .attr("x1", start[0])
          .attr("y1", start[1])
          .attr("x2", end[0])
          .attr("y2", end[1])
          .attr("stroke", "#333")
          .attr("stroke-width", width * 0.0015)
          .attr("stroke-dasharray", hasFilter ? null : "1 2")
          .attr("fill", "none")
          .attr("stroke-opacity", match ? 1 : 0.25);
      });

      // Click target in center
      innerGroup.append("circle")
        .attr("cx", scaledX)
        .attr("cy", scaledY)
        .attr("r", 10)
        .attr("fill", "transparent")
        .on("click", () => {
          setSelectedCollection(collection);
          const defaultOrder = buildDefaultOrder(collection.filter_set, valueSequences);
          setFilterOrder(defaultOrder.length ? defaultOrder : [...collection.filter_set]);
        })
        .append("title")
        .text(`Score: ${collection.total_score?.toFixed(2) ?? "N/A"}\nFilters: ${filterCount}`);
    });

    // Selected collection halo
    data.forEach((collection) => {
      if (!collection || !collection.position) return;

      const scaledRadius = (collection.position.r ?? 0.04) * 200;
      const scaledX = collection.position.x * squareWidth;
      const scaledY = collection.position.y * squareHeight;

      if (selectedCollection && selectedCollection.id === collection.id) {
        innerGroup.append("circle")
          .attr("cx", scaledX)
          .attr("cy", scaledY)
          .attr("r", scaledRadius + width * 0.03)
          .attr("stroke", "red")
          .attr("stroke-width", 2)
          .attr("fill", "none")
          .attr("stroke-dasharray", "5 5")
          .attr("pointer-events", "none");
      }
    });

    // —————————————— HISTORY OVERLAYS ——————————————
    const overlayGroup = innerGroup.append("g").attr("class", "history-overlays");

    const baseR = Math.max(3, Math.min(squareWidth, squareHeight) * 0.012);
    const ringPad = Math.max(6, baseR * 0.9);

    data.forEach((collection) => {
      if (!collection?.position) return;
      const seq = seqByCollection.get(collection.id);
      if (!seq) return; // not in history

      const cx = collection.position.x * squareWidth;
      const cy = collection.position.y * squareHeight;
      const polyR = collection.position.r * Math.min(squareWidth, squareHeight) * 1;
      const ringR = polyR * 1.15; // a bit outside the polygon

      // dashed ring
      overlayGroup.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", ringR)
        .attr("fill", "none")
        .attr("stroke", "#616161ff")
        .attr("stroke-width", 1.2)
        .attr("pointer-events", "none");

      // small badge with sequence number (top-right)
      const badgeX = cx + ringR + ringPad;
      const badgeY = cy - ringR;
      const bw = Math.max(18, baseR * 3.2);
      const bh = Math.max(14, baseR * 2.4);
      const br = Math.min(6, bw * 0.25);

      overlayGroup.append("rect")
        .attr("x", badgeX - bw / 2)
        .attr("y", badgeY - bh / 2)
        .attr("width", bw).attr("height", bh)
        .attr("rx", br).attr("ry", br)
        .attr("fill", "#535353ff")
        .attr("stroke", "#c9c9c9ff")
        .attr("stroke-width", 0.8)
        .attr("pointer-events", "none")
        .attr("opacity", 0.8);

      overlayGroup.append("text")
        .attr("x", badgeX).attr("y", badgeY + 0.5)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size", Math.max(10, baseR * 1.4))
        .attr("font-weight", 700)
        .attr("fill", "#fff")
        .text(String(seq))
        .attr("pointer-events", "none");
    });
    // —————————————— /HISTORY OVERLAYS ——————————————

    // === Legends ===
    const legendWidth = squareWidth * 0.9;
    const legendHeight = width * 0.02;
    const legendX = (width - legendWidth) / 2;
    const legendY = height * 0.82;

    const legendSteps = uniqueFilterCounts.length;
    const stepWidth = legendWidth / legendSteps;

    const legendGroup = svg.append("g")
      .attr("transform", `translate(${offsetX + legendX}, ${offsetY + legendY})`);

    const SPACING = 3;

    const typeLegendY = height * 0.74;
    const typeLegendSteps = uniqueTypeCounts.length;
    const typeStepWidth = legendWidth / typeLegendSteps;

    const typeLegendGroup = svg.append("g")
      .attr("transform", `translate(${offsetX + legendX}, ${offsetY + typeLegendY})`);

    uniqueTypeCounts.forEach((val, i) => {
      typeLegendGroup.append("rect")
        .attr("x", i * typeStepWidth)
        .attr("y", 0)
        .attr("width", typeStepWidth)
        .attr("height", legendHeight)
        .attr("fill", typeColorScale(val))
        .attr("opacity", 0.95);
    });

    const typeScale = d3.scaleLinear()
      .domain(d3.extent(uniqueTypeCounts))
      .range([typeStepWidth / 2, legendWidth - typeStepWidth / 2]);

    const typeAxis = d3.axisBottom(typeScale)
      .tickValues(uniqueTypeCounts)
      .tickFormat(d => `${d}`);

    const typeAxisGroup = typeLegendGroup.append("g")
      .attr("transform", `translate(0, ${legendHeight + SPACING})`)
      .call(typeAxis);

    typeAxisGroup.selectAll("path, line").attr("stroke", "#666");
    typeAxisGroup.selectAll("text").style("fill", "#333").style("font-size", "8px");

    typeLegendGroup.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", -0.5 * legendHeight)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .text("Type Count");

    uniqueFilterCounts.forEach((val, i) => {
      legendGroup.append("rect")
        .attr("x", i * stepWidth)
        .attr("y", SPACING)
        .attr("width", stepWidth)
        .attr("height", legendHeight)
        .attr("fill", colorScale(val))
        .attr("opacity", 0.95);
    });

    const barCounts = uniqueFilterCounts.length;
    const XaxisOffset = legendWidth / (barCounts * 2);

    const legendScale = d3.scaleLinear()
      .domain(d3.extent(uniqueFilterCounts))
      .range([XaxisOffset, legendWidth - XaxisOffset]);

    const axis = d3.axisBottom(legendScale)
      .tickValues(uniqueFilterCounts)
      .tickFormat(d => `${d}`);

    const axisGroup = legendGroup.append("g")
      .attr("transform", `translate(0, ${legendHeight + 2 * SPACING })`)
      .call(axis);

    axisGroup.selectAll("path").attr("stroke", "#666");
    axisGroup.selectAll("line").attr("stroke", "#666");
    axisGroup.selectAll("text").style("fill", "#333").style("font-size", "8px");

    legendGroup.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", -0.15 * legendHeight)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .text("Filter Count");

  // ⬇️ IMPORTANT: include appliedCols so Apply/Clear triggers redraw
  }, [data, width, height, selectedFilter, selectedCollection, seqByCollection, appliedCols]);

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top controls bar (fixed height content) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 8px",
        }}
      >
        {/* Scrollable columns list with INSIDE border */}
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            whiteSpace: "nowrap",
            flex: 1,
            padding: "3px 3px",
            border: "1px solid #6b6a6aff",
            boxSizing: "border-box",
          }}
        >
          {allColumns.map((col) => (
            <label
              key={col}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selectedCols.includes(col)}
                onChange={() => toggleCol(col)}
              />
              <span
                style={{
                  color: "black",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {col}
              </span>
            </label>
          ))}
        </div>

        {/* Apply / Clear buttons */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 8,
            marginLeft: 12,
            marginRight: 12,
          }}
        >
          <button onClick={applyCombo} style={actionButtonStyle}>
            Apply
          </button>
          <button onClick={clearCombo} style={actionButtonStyle}>
            Clear
          </button>
        </div>
      </div>

      {/* Canvas fills the remaining height */}
      <div style={{ position: "relative", flex: "1 1 0", minHeight: 0 }}>
        <svg
          ref={ref}
          width="100%"
          height="100%"
          style={{ display: "block", border: "0px solid #ccc" }}
        />
      </div>
    </div>
  );

}

export default CollectionVoronoi;
