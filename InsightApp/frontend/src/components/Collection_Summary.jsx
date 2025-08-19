import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line,
  ComposedChart, PieChart, Pie, Cell, Legend, Area
} from "recharts";
import * as d3 from "d3";

function CollectionSummary({ insights, collections, width, height, onFilterSelected }) {
  // === 1️⃣ Score distribution ===
  const scoreData = useMemo(() => {
    const scores = collections.map(c => c.total_score ?? 0);
    const minScore = 0;
    const maxScore = Math.ceil(Math.max(...scores));
    const binSize = 0.5;

    const bins = [];
    for (let i = minScore; i < maxScore; i += binSize) {
      bins.push({
        binStart: i,
        binLabel: `${i.toFixed(1)}-${(i + binSize).toFixed(1)}`,
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
      numTypes,
      count
    })).sort((a, b) => a.numTypes - b.numTypes);
  }, [collections]);

  // Use schemeBlues (same as Voronoi)
  const uniqueTypeCounts = Array.from(new Set(typeData.map(d => d.numTypes))).sort((a, b) => a - b);
  const bluesSize = Math.max(3, Math.min(9, uniqueTypeCounts.length || 3));
  const blues = d3.schemeBlues[bluesSize];
  const typeColorScale = d3.scaleOrdinal()
    .domain(uniqueTypeCounts)
    .range(blues.slice(blues.length - uniqueTypeCounts.length));

  // === 3️⃣ Filter count ===
  const filterCountData = useMemo(() => {
    if (!collections || collections.length === 0) return [];

    const counter = {};
    collections.forEach(coll => {
      const filterCount = (coll.filter_set || []).length;
      counter[filterCount] = (counter[filterCount] ?? 0) + 1;
    });

    const uniqueFilterCounts = Array.from(
      new Set(Object.keys(counter).map(Number))
    ).sort((a, b) => a - b);


    // Use schemeReds (same as polygons)
    const redsSize = Math.max(3, Math.min(9, uniqueFilterCounts.length || 3));
    const reds = d3.schemeReds[redsSize];
    const colorScale = d3.scaleOrdinal()
      .domain(uniqueFilterCounts)
      .range(reds.slice(reds.length - uniqueFilterCounts.length));

    return uniqueFilterCounts.map(filterCount => ({
      filterCount,
      count: counter[filterCount] ?? 0,
      color: colorScale(filterCount)
    }));
  }, [collections]);

  // === Dimensions ===
  const chartWidth = width / 3;                      // split 3 charts horizontally
  const headingHeight = height * 0.08;               // reserve 12% height for heading
  const chartHeight = height - headingHeight;        // remaining height for chart
  const fontSize = height * 0.04;                    // font size ~6% of container height
  const barSize = Math.max(5, chartWidth * 0.15);    // scale bar size
  
  

  return (
    <div style={{ width, height, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      
      {/* === Score Distribution with Line === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Score Distribution</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={scoreData}
            margin={{
              top: 0,
              right: width * 0.02,
              bottom: height * 0.02,
              left: -width * 0.07
            }}
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

            {/* ✅ Only Area is kept */}
            <Area
              type="monotone"
              dataKey="count"
              stroke="#FF6600"
              fill="#FFCCAA"
              fillOpacity={0.4}
              dot={{ r: 0, stroke: '#FF6600', strokeWidth: 1 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
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
              onClick={(data) => {
                onFilterSelected({ type: "type_count", value: data.numTypes });
              }}
              fillOpacity={1}
            >
              {typeData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={typeColorScale(entry.numTypes)}
                  stroke="#333"          // 🔹 dark stroke border
                  strokeWidth={0.2}        // 🔹 thickness
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
              label={({ cx, cy, midAngle, outerRadius, percent, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = outerRadius * 0.8; // push label slightly outside
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                const value = filterCountData[index];

                return (
                  <text
                    x={x}
                    y={y}
                    fill="#333"
                    textAnchor="middle" // centered label
                    dominantBaseline="central"
                    fontSize={width * 0.015}
                  >
                    {`F${value.filterCount} (${value.count}, ${(percent * 100).toFixed(1)}%)`}
                  </text>
                );
              }}
              onClick={(data) => {
                onFilterSelected?.({ type: "filter_count", count: data.filterCount });
              }}
            >
              {filterCountData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

export default CollectionSummary;