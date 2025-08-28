import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import * as d3 from "d3";

// helper: restrict an interpolator to a subrange [t0, t1]
function subInterpolator(interpolator, t0 = 0.3, t1 = 0.8) {
  return t => interpolator(t0 + t * (t1 - t0));
}

function CollectionSummary({ insights, collections, width, height, onFilterSelected }) {
  // =========================
  // NEW: local selection state
  // =========================
  const [scoreSelection, setScoreSelection] = useState(null);     // {min, max} | null
  const [typeSelection, setTypeSelection]   = useState(null);     // {value} | null
  const [filterSelection, setFilterSelection] = useState(null);   // {count} | null

  // Small helpers
  const send = (payload) => onFilterSelected?.(payload);
  const sameRange = (a, b) => a && b && a.min === b.min && a.max === b.max;
  const sameVal = (a, b, key) => a && b && a[key] === b[key];

  // === 1️⃣ Score distribution ===
  const scoreData = useMemo(() => {
    if (!collections || collections.length === 0) return [];

    const scores = collections.map(c => c.total_score ?? 0);
    const minScore = 0;
    const maxScore = Math.ceil(Math.max(...scores, 0)); // guard against empty
    const binSize = 0.5;

    const bins = [];
    for (let i = minScore; i < maxScore; i += binSize) {
      const binStart = Number(i.toFixed(1));
      const binEnd = Number((i + binSize).toFixed(1));
      bins.push({
        binStart,
        binEnd,
        binLabel: `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`,
        count: 0
      });
    }

    collections.forEach(coll => {
      const score = coll.total_score ?? 0;
      const binIndex = Math.floor(score / binSize);
      if (bins[binIndex]) {
        bins[binIndex].count += 1;
      }
    });

    return bins;
  }, [collections]);

  // === 2️⃣ Type variety ===
  const typeData = useMemo(() => {
    const counter = {};
    collections.forEach(coll => {
      const uniqueTypes = new Set((coll.insights || []).map(ins => ins.type ?? "Unknown"));
      const typeCount = uniqueTypes.size;
      counter[typeCount] = (counter[typeCount] ?? 0) + 1;
    });

    return Object.entries(counter).map(([numTypes, count]) => ({
      numTypes: Number(numTypes),
      count
    })).sort((a, b) => a.numTypes - b.numTypes);
  }, [collections]);

  // Voronoi-aligned: interpolateBlues with subrange 0.3–0.8 (continuous)
  const uniqueTypeCounts = Array.from(new Set(typeData.map(d => d.numTypes))).sort((a, b) => a - b);
  const typeExtent = d3.extent(uniqueTypeCounts);
  const typeDomain =
    typeExtent[0] === typeExtent[1]
      ? [typeExtent[0] - 1, typeExtent[1] + 1]
      : typeExtent;

  const typeInterpolator = subInterpolator(d3.interpolateBlues, 0.05, 0.6);
  const typeColorScale = d3.scaleSequential(typeInterpolator)
    .domain(typeDomain)
    .clamp(true);

  // === 3️⃣ Filter count ===
  const filterCountData = useMemo(() => {
    if (!collections || collections.length === 0) return [];

    const counter = {};
    collections.forEach(coll => {
      const filterCount = (coll.filter_set || []).length;
      counter[filterCount] = (counter[filterCount] ?? 0) + 1;
    });

    const uniqueFilterCounts = Array.from(new Set(Object.keys(counter).map(Number))).sort((a, b) => a - b);
    const filterExtent = d3.extent(uniqueFilterCounts);
    const filterDomain =
      filterExtent[0] === filterExtent[1]
        ? [filterExtent[0] - 1, filterExtent[1] + 1]
        : filterExtent;

    // Polygon-aligned: interpolateReds with subrange 0.3–0.8 (continuous)
    const redsSub = subInterpolator(d3.interpolateReds, 0.05, 0.6);
    const colorScale = d3.scaleSequential(redsSub).domain(filterDomain).clamp(true);

    return uniqueFilterCounts.map(filterCount => ({
      filterCount,
      count: counter[filterCount] ?? 0,
      color: colorScale(filterCount)
    }));
  }, [collections]);

  // === Dimensions ===
  const chartWidth = width / 3;
  const headingHeight = height * 0.08;
  const chartHeight = height - headingHeight;
  const fontSize = height * 0.04;
  const barSize = Math.max(5, chartWidth * 0.15);

  // =========================
  // NEW: click handlers (toggle)
  // =========================
  const handleScoreClick = (d) => {
    const next = { type: "score", min: d.binStart, max: d.binEnd };
    if (sameRange(scoreSelection, next)) {
      setScoreSelection(null);
      send(null); // toggle OFF
    } else {
      setScoreSelection(next);
      send(next); // toggle ON
    }
  };

  const handleTypeClick = (d) => {
    const next = { type: "type_count", value: Number(d.numTypes) };
    if (sameVal(typeSelection, next, "value")) {
      setTypeSelection(null);
      send(null);
    } else {
      setTypeSelection(next);
      send(next);
    }
  };

  const handleFilterClick = (d) => {
    const next = { type: "filter_count", count: d.filterCount };
    if (sameVal(filterSelection, next, "count")) {
      setFilterSelection(null);
      send(null);
    } else {
      setFilterSelection(next);
      send(next);
    }
  };

  // (Optional) tiny visual cue for selected bars/slices
  const isScoreSelected = (d) => scoreSelection && d.binStart === scoreSelection.min && d.binEnd === scoreSelection.max;
  const isTypeSelected = (d) => typeSelection && Number(d.numTypes) === typeSelection.value;
  const isFilterSelected = (d) => filterSelection && d.filterCount === filterSelection.count;

  return (
    <div style={{ width, height, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      {/* === Score Distribution with Line === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Score Distribution</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={scoreData}
            margin={{ top: 0, right: width * 0.02, bottom: height * 0.02, left: -width * 0.07 }}
            barCategoryGap="0%"
            barGap={0}
          >
            <CartesianGrid stroke="#f5f5f5" />
            <XAxis
              dataKey="binLabel"
              tick={{ fontSize: fontSize * 0.6 }}
              angle={-15}
              interval={0}
              tickFormatter={(label) => {
                const start = parseFloat(label.split("-")[0]);
                return Number.isInteger(start) ? "" : start.toFixed(1);
              }}
            />
            <YAxis tick={{ fontSize: fontSize * 0.8 }} allowDecimals={false} />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#a5a5a5ff"
              onClick={handleScoreClick}
              isAnimationActive={false}
            >
              {scoreData.map((d, i) => (
                <Cell
                  key={`s-${i}`}
                  fill="#a5a5a5ff"
                  fillOpacity={isScoreSelected(d) ? 1 : 0.8}
                  stroke={isScoreSelected(d) ? "#333" : "none"}
                  strokeWidth={isScoreSelected(d) ? 0.8 : 0}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Type Variety === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Type Variety</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={typeData} margin={{ top: 0, right: width * 0.02, bottom: height * 0.02, left: -width * 0.07 }}>
            <CartesianGrid stroke="#f5f5f5" />
            <XAxis dataKey="numTypes" tick={{ fontSize: fontSize * 0.8 }} />
            <YAxis tick={{ fontSize: fontSize * 0.8 }} allowDecimals={false} />
            <Tooltip />
            <Bar
              dataKey="count"
              barSize={barSize}
              onClick={handleTypeClick}
              isAnimationActive={false}
            >
              {typeData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={typeColorScale(entry.numTypes)}
                  stroke={isTypeSelected(entry) ? "#333" : "#333"}
                  strokeWidth={isTypeSelected(entry) ? 1.2 : 0.2}
                  fillOpacity={isTypeSelected(entry) ? 1 : 0.9}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Filter Count (Pie Chart) === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Filter Count</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart>
            <Tooltip />
            <Pie
              data={filterCountData}
              dataKey="count"
              nameKey="filterCount"
              cx="50%"
              cy="45%"
              outerRadius="80%"
              labelLine={false}
              isAnimationActive={false}
              label={({ cx, cy, midAngle, outerRadius, percent, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = outerRadius * 0.8;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                const value = filterCountData[index];
                if (!value) return null;

                return (
                  <text
                    x={x}
                    y={y}
                    fill="#333"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={width * 0.015}
                  >
                    {`F${value.filterCount} (${value.count}, ${(percent * 100).toFixed(1)}%)`}
                  </text>
                );
              }}
              onClick={handleFilterClick}
            >
              {filterCountData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke={isFilterSelected(entry) ? "#333" : "none"}
                  strokeWidth={isFilterSelected(entry) ? 1.2 : 0}
                  opacity={isFilterSelected(entry) ? 1 : 0.95}
                  cursor="pointer"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default CollectionSummary;
