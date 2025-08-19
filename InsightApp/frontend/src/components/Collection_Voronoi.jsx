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


function CollectionVoronoi({ width, height, data, setSelectedCollection, setFilterOrder, selectedFilter, selectedCollection, history, valueSequences }) {
  const ref = useRef();

  function passesFilter(collection, selectedFilter) {
    if (!selectedFilter) return true;

    switch (selectedFilter.type) {
      case "score": {
        const score = collection.total_score ?? 0;
        const [low, high] = selectedFilter.bin.split("-").map(parseFloat);
        return score >= low && score < high;
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
    history.forEach((h, i) => {
      const id = h?.collection?.id;
      if (id != null && !m.has(id)) m.set(id, i + 1);
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
    const squareHeight = height * 0.8 - 2 * PADDING;
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

    // === Color scales ===
    // (A) Filter-count colors for POLYGONS (Reds)
    const uniqueFilterCounts = Array.from(new Set(data.map(d => d.filter_set?.length || 0))).sort((a, b) => a - b);
    const redsSize = Math.max(3, Math.min(9, uniqueFilterCounts.length || 3));
    const reds = d3.schemeReds[redsSize];
    const colorScale = d3.scaleOrdinal()
      .domain(uniqueFilterCounts)
      // take the darkest N from the chosen palette for better contrast
      .range(reds.slice(reds.length - uniqueFilterCounts.length));

    // (B) Type-count colors for VORONOI CELLS (Blues)
    const typeCounts = data.map(d => {
      const uniqueTypes = new Set((d.insights || []).map(ins => ins.type ?? "Unknown"));
      return uniqueTypes.size;
    });
    const uniqueTypeCounts = Array.from(new Set(typeCounts)).sort((a, b) => a - b);
    const bluesSize = Math.max(3, Math.min(9, uniqueTypeCounts.length || 3));
    const blues = d3.schemeBlues[bluesSize];
    const typeColorScale = d3.scaleOrdinal()
      .domain(uniqueTypeCounts)
      .range(blues.slice(blues.length - uniqueTypeCounts.length));

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

      const match = passesFilter(collection, selectedFilter);
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

      const match = passesFilter(collection, selectedFilter);
      const finalColor = match ? color : "#ccc";

      const scaledRadius = collection.position.r * Math.min(squareHeight, squareWidth) * 0.6;
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
        .attr("stroke", "none");

      // Draw each side as a line
      points.forEach((start, i) => {
        const end = points[(i + 1) % points.length];

        // Check if this side has a filter
        const hasFilter = i < collection.filter_set.length;

        innerGroup.append("line")
          .attr("x1", start[0])
          .attr("y1", start[1])
          .attr("x2", end[0])
          .attr("y2", end[1])
          .attr("stroke", "#333")
          .attr("stroke-width", width * 0.0015)
          .attr("stroke-dasharray", hasFilter ? null : "1 2")
          .attr("fill", "none");
      });

      // Optional: click target in center
      innerGroup.append("circle")
        .attr("cx", scaledX)
        .attr("cy", scaledY)
        .attr("r", 10)
        .attr("fill", "transparent")
        .on("click", () => {
          setSelectedCollection(collection);
          console.log("clicked collection: ", collection)
          const defaultOrder = buildDefaultOrder(collection.filter_set, valueSequences);
          setFilterOrder(defaultOrder.length ? defaultOrder : [...collection.filter_set]);
        })
        .append("title")
        .text(`Score: ${collection.total_score?.toFixed(2) ?? "N/A"}\nFilters: ${filterCount}`);
    });

    // Selected collection halo
    data.forEach((collection) => {
      if (!collection || !collection.position) return;

      const scaledRadius = (collection.position.r ?? 0.04) * 300;
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
        .attr("stroke", "#949494ff")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "4 3")
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
        .attr("fill", "#a1a1a1ff")
        .attr("stroke", "#707070ff")
        .attr("stroke-width", 0.8)
        .attr("pointer-events", "none");

      overlayGroup.append("text")
        .attr("x", badgeX).attr("y", badgeY + 0.5) // slight vertical centering
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size", Math.max(10, baseR * 1.4))
        .attr("font-weight", 700)
        .attr("fill", "#fff")
        .text(String(seq))
        .attr("pointer-events", "none");
    });
    // —————————————— /HISTORY OVERLAYS ——————————————

    // === 🎨 Color Legend (Filter Count) ===
    const legendWidth = squareWidth * 0.9;
    const legendHeight = width * 0.02;
    const legendX = (width - legendWidth) / 2; // center horizontally with padding
    const legendY = height * 0.93; // position just below square canvas

    const legendSteps = uniqueFilterCounts.length;
    const stepWidth = legendWidth / legendSteps;

    const legendGroup = svg.append("g")
      .attr("transform", `translate(${offsetX + legendX}, ${offsetY + legendY})`);

    const SPACING = 3; // space between color legend and axis

// === 🎨 Color Legend (Type Count) ===
const typeLegendY = height * 0.85; // a bit lower than filter count legend
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

// X-axis for type legend
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

// Label
typeLegendGroup.append("text")
  .attr("x", legendWidth / 2)
  .attr("y", 3 * legendHeight)
  .attr("text-anchor", "middle")
  .attr("font-size", "8px")
  .text("Type Count");


    // 🔽 Filter Count Color Legend (Reds)
    uniqueFilterCounts.forEach((val, i) => {
      legendGroup.append("rect")
        .attr("x", i * stepWidth)
        .attr("y", SPACING)
        .attr("width", stepWidth)
        .attr("height", legendHeight)
        .attr("fill", colorScale(val))
        .attr("opacity", 0.95);
    });

    // === Axis below color legend
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

    // Style axis
    axisGroup.selectAll("path").attr("stroke", "#666");
    axisGroup.selectAll("line").attr("stroke", "#666");
    axisGroup.selectAll("text").style("fill", "#333").style("font-size", "8px");

    // Label
    legendGroup.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", 3 * legendHeight)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .text("Filter Count");



  }, [data, width, height, selectedFilter, selectedCollection, seqByCollection]);

  return (
    <div style={{ width, height }}>
      {/* Bottom: D3 Canvas */}
      <div style={{ position: "relative" }}>
        <svg
          ref={ref}
          width={width}
          height={height}
          style={{ display: "block", border: "0px solid #ccc" }}
        />
      </div>
    </div>
  );
}

export default CollectionVoronoi;
