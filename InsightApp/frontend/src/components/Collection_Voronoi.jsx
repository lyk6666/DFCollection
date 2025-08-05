import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { Delaunay } from "d3-delaunay"; // ✅ Required for Voronoi
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, Legend, ResponsiveContainer
} from "recharts";

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

function CollectionVoronoi({ width, height, data, setSelectedCollection, setFilterOrder, selectedFilter, selectedCollection }) {
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

  useEffect(() => {
    console.log("Received filter from Overview:", selectedFilter);
  }, [selectedFilter]);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    // Dimensions for centered square canvas
    const PADDING = 0;
    const squareWidth = width - 2 * PADDING
    const squareHeight = height * 0.9 - 2 * PADDING
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

    // Create a color scale for distinct filter counts
    const uniqueFilterCounts = Array.from(new Set(data.map(d => d.filter_set?.length || 0))).sort((a, b) => a - b);
    const colorScale = d3.scaleOrdinal()
      .domain(uniqueFilterCounts)
      .range(d3.schemeSpectral[uniqueFilterCounts.length].slice().reverse()); // reversed for better visual balance

    // 🟦 Collect positions for Voronoi
    const positions = data.map(d => [
      d.position.x * squareWidth,
      d.position.y * squareHeight
    ]);

    // 🟨 Voronoi setup
    const delaunay = Delaunay.from(positions);
    const voronoi = delaunay.voronoi([0, 0, squareWidth, squareHeight]);

    // 🟥 Draw Voronoi cells (optional visual layer)
    for (let i = 0; i < data.length; i++) {
      const collection = data[i];
      const filterCount = collection.filter_set.length;
      const color = colorScale(filterCount);

      const match = passesFilter(collection, selectedFilter);
      const finalColor = match ? color : "#ccc";


      innerGroup.append("path")
        .attr("d", voronoi.renderCell(i))
        .attr("fill", finalColor)
        .attr("opacity", 0.7)
        .attr("pointer-events", "none");
    }

    data.forEach((collection, i) => {
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
        .attr("stroke", "none")
        .attr("opacity", 0.95);

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
          .attr("stroke-width", 1)
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
          setFilterOrder([...collection.filter_set]);
        })
        .append("title")
        .text(`Score: ${collection.total_score?.toFixed(2) ?? "N/A"}\nFilters: ${filterCount}`);

    });

    // ✅ After full forEach loop:
    data.forEach((collection, i) => {
      if (!collection || !collection.position) return;

      const filterCount = collection.filter_set.length;
      const sides = getPolygonSides(filterCount);
      const scaledRadius = (collection.position.r ?? 0.04) * 300;
      const scaledX = collection.position.x * squareWidth;
      const scaledY = collection.position.y * squareHeight;

      if (selectedCollection && selectedCollection.id === collection.id) {
        innerGroup.append("circle")
          .attr("cx", scaledX)
          .attr("cy", scaledY)
          .attr("r", scaledRadius + width * 0.03)
          .attr("stroke", "red")
          .attr("stroke-width", width * 0.005)
          .attr("fill", "none")
          .attr("stroke-dasharray", "5 5")
          .attr("pointer-events", "none");
      }
    });

    // === 🎨 Color Legend (Color Bar for Filter Count) ===
    const legendWidth = squareWidth * 0.6;
    const legendHeight = 10;
    const legendX = (width - legendWidth) / 2 - offsetX;
    const legendY = squareHeight + 25; // position just below square canvas

    const filterCounts = data.map(d => d.filter_set?.length || 0);
    const countExtent = d3.extent(filterCounts);

    // Linear scale to map filter count → position
    const legendScale = d3.scaleLinear()
      .domain(countExtent)
      .range([0, legendWidth]);

    const legendSteps = uniqueFilterCounts.length;
    const stepWidth = legendWidth / legendSteps;

    const legendGroup = svg.append("g")
      .attr("transform", `translate(${offsetX + legendX}, ${offsetY + legendY})`);

    uniqueFilterCounts.forEach((val, i) => {
      legendGroup.append("rect")
        .attr("x", i * stepWidth)
        .attr("y", 0)
        .attr("width", stepWidth)
        .attr("height", legendHeight)
        .attr("fill", colorScale(val))
        .attr("opacity", 0.95);

      // Text label below each block
      legendGroup.append("text")
        .attr("x", i * stepWidth + stepWidth / 2)
        .attr("y", legendHeight + 10)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .text(val);
    });

    // Axis below the color bar
    const axis = d3.axisBottom(legendScale)
      .tickValues(uniqueFilterCounts)
      .tickFormat(d => `${d}`);

    legendGroup.append("g")
      .attr("transform", `translate(0, ${legendHeight})`)
      .call(axis)
      .selectAll("text")
      .style("font-size", "10px");

    // Optional label
    legendGroup.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", legendHeight - 15)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Filter Count → Color");

      
  }, [data, width, height, selectedFilter, selectedCollection]);

  return (
    <div style={{ width, height }}>
      {/* Bottom: D3 Canvas */}
      <div style={{ position: "relative" }}>
        <svg
          ref={ref}
          width={width}
          height={height} // subtract height of top row
          style={{ display: "block", border: "0px solid #ccc" }}
        />
      </div>
    </div>
  );
}

export default CollectionVoronoi;
