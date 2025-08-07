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
    const squareHeight = height * 0.8 - 2 * PADDING
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
    const typeVarietyExtent = d3.extent(data.map(d => {
    const uniqueTypes = new Set((d.insights || []).map(ins => ins.type ?? "Unknown"));
      return uniqueTypes.size;
    }));
    const opacityScale = d3.scaleLinear()
      .domain(typeVarietyExtent)
      .range([0.3, 0.8]); // min to max opacity
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
          .attr("stroke", "#000")               // edge color
          .attr("stroke-width", 0.5)            // edge thickness
          .attr("stroke-opacity", 0.3)          // transparency
      }
    }

    // 🟥 Draw Voronoi cells (optional visual layer)
    for (let i = 0; i < data.length; i++) {
      const collection = data[i];

      const filterCount = collection.filter_set.length;
      const color = colorScale(filterCount);

      const uniqueTypes = new Set((collection.insights || []).map(ins => ins.type ?? "Unknown"));
      const variety = uniqueTypes.size;
      const opacity = opacityScale(variety);

      const match = passesFilter(collection, selectedFilter);
      const finalColor = match ? color : "#ccc";
      const finalOpacity = match ? opacity : 0.2;

      innerGroup.append("path")
        .attr("d", voronoi.renderCell(i))
        .attr("fill", finalColor)
        .attr("opacity", finalOpacity)
        .attr("pointer-events", "none");

      // // Draw connecting lines between neighboring points
      // innerGroup.append("g")
      //   .attr("stroke", "#b4b4b4ff")
      //   .attr("stroke-opacity", 0.1)
      //   .attr("stroke-width", 0.5)
      //   .selectAll("line")
      //   .data(data.flatMap((d, i) => {
      //     const neighbors = Array.from(delaunay.neighbors(i));
      //     const x1 = d.position.x * squareWidth;
      //     const y1 = d.position.y * squareHeight;

      //     return neighbors.map(j => {
      //       const x2 = data[j].position.x * squareWidth;
      //       const y2 = data[j].position.y * squareHeight;
      //       return { x1, y1, x2, y2 };
      //     });
      //   }))
      //   .join("line")
      //   .attr("x1", d => d.x1)
      //   .attr("y1", d => d.y1)
      //   .attr("x2", d => d.x2)
      //   .attr("y2", d => d.y2);

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

      const scaledRadius = collection.position.r * Math.min(squareHeight, squareWidth) * 0.5;
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
        .attr("opacity", 1.0);

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
          setFilterOrder([...collection.filter_set]);
        })
        .append("title")
        .text(`Score: ${collection.total_score?.toFixed(2) ?? "N/A"}\nFilters: ${filterCount}`);

    });

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


    
    // === 🎨 Color + Opacity Legend ===
    const legendWidth = squareWidth * 0.9;
    const legendHeight = width * 0.02;
    const legendX = (width - legendWidth) / 2 + width * 0.03; // center horizontally with padding
    const legendY = height * 0.93; // position just below square canvas

    const legendSteps = uniqueFilterCounts.length;
    const stepWidth = legendWidth / legendSteps;

    const legendGroup = svg.append("g")
      .attr("transform", `translate(${offsetX + legendX}, ${offsetY + legendY})`);

    // === ⬆️ Opacity Legend (above color legend)
    const opacityLegendHeight = width * 0.012;
    const opacityLevels = Array.from({ length: 9 }, (_, i) => 0.1 + (0.9/ 9) * i); // low, medium, high opacity
    const SPACING = 3; // space between opacity legend and color legend

    // Add blocks for each opacity level (row)
    opacityLevels.forEach((opacity, rowIndex) => {
      uniqueFilterCounts.forEach((val, i) => {
        legendGroup.append("rect")
          .attr("x", i * stepWidth + stepWidth * 0.05) // slight padding
          .attr("y", -opacityLegendHeight * (opacityLevels.length - rowIndex))
          .attr("width", stepWidth * 0.9)
          .attr("height", opacityLegendHeight * 0.9)
          .attr("fill", colorScale(val))
          .attr("opacity", opacity);
      }); 

      // // Label the type variety (reverse of opacity scale)
      // legendGroup.append("text")
      //   .attr("x", -5)
      //   .attr("y", -opacityLegendHeight * (opacityLevels.length - rowIndex - 0.25))
      //   .attr("text-anchor", "end")
      //   .attr("font-size", "10px")
      //   .text(`TypeVar: ${Math.round(opacityScale.invert(opacity))}`);
    });

    // === 🔽 Filter Count Color Legend
    uniqueFilterCounts.forEach((val, i) => {
      legendGroup.append("rect")
        .attr("x", i * stepWidth)
        .attr("y", SPACING)
        .attr("width", stepWidth)
        .attr("height", legendHeight)
        .attr("fill", colorScale(val))
        .attr("opacity", 0.95);

      // // Label below each color block
      // legendGroup.append("text")
      //   .attr("x", i * stepWidth + stepWidth / 2)
      //   .attr("y", legendHeight + 10)
      //   .attr("text-anchor", "middle")
      //   .attr("font-size", "10px")
      //   .text(val);
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
      .call(axis)

    // Set tick line color
    axisGroup.selectAll("path") // axis line
      .attr("stroke", "#666");   // dark gray

    axisGroup.selectAll("line") // tick lines
      .attr("stroke", "#666");   // dark gray

    // Set label color
    axisGroup.selectAll("text")
      .style("fill", "#333")     // label color
      .style("font-size", "8px");


// === 🆕 Y-Axis for Opacity
const yAxisGroup = legendGroup.append("g")
  .attr("transform", `translate(${-opacityLegendHeight * 0.5}, ${-opacityLegendHeight * opacityLevels.length + opacityLegendHeight * 0.5})`); // Shift to align with opacity blocks

const yScale = d3.scaleLinear()
  .domain([0, 8])
  .range([
    0, // bottom
    opacityLegendHeight * 8 // top
  ]);

const yAxis = d3.axisLeft(yScale)
  .tickValues([0, 4, 8]) // only show these ticks
  .tickFormat(d => d)   // show actual numbers
  .tickSize(4); // <-- This sets both inner and outer tick line lengths

yAxisGroup.call(yAxis);

// Style the Y-axis
yAxisGroup.selectAll("path") // axis line
  .attr("stroke", "#666");

yAxisGroup.selectAll("line") // tick lines
  .attr("stroke", "#666");

yAxisGroup.selectAll("text") // tick labels
  .style("fill", "#333")
  .style("font-size", "8px");

// Axis label
yAxisGroup.append("text")
  .attr("x", -opacityLegendHeight * 4) // middle of axis
  .attr("y", -width * 0.05)
  .attr("transform", "rotate(-90)")
  .attr("text-anchor", "middle")
  .attr("fill", "#333")
  .attr("font-size", "8px")
  .text("Type Count");

    // === Labels
    legendGroup.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", 3 * legendHeight)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .text("Filter Count");

    // legendGroup.append("text")
    //   .attr("x", -40)
    //   .attr("y", -opacityLegendHeight * opacityLevels.length - 5)
    //   .attr("text-anchor", "start")
    //   .attr("font-size", "12px")
    //   .text("Type Variety → Opacity");

      
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
