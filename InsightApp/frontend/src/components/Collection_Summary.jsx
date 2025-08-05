import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

function CollectionSummary({ insights, collections, width, height, onFilterSelected }) {
  // === 1️⃣ Score distribution ===
  const scoreData = useMemo(() => {
    const scores = collections.map(c => c.total_score ?? 0);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const binCount = 6;
    const binSize = (maxScore - minScore) / binCount;

    const bins = Array.from({ length: binCount }, (_, i) => ({
      bin: `${(minScore + i * binSize).toFixed(2)}-${(minScore + (i + 1) * binSize).toFixed(2)}`,
      count: 0
    }));

    collections.forEach(coll => {
      const score = coll.total_score ?? 0;
      const binIndex = Math.min(
        Math.floor((score - minScore) / binSize),
        binCount - 1
      );
      bins[binIndex].count += 1;
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

  // === 3️⃣ Filter count ===
  const filterCountData = useMemo(() => {
    const counter = {};
    collections.forEach(coll => {
      const filterCount = (coll.filter_set || []).length;
      counter[filterCount] = (counter[filterCount] ?? 0) + 1;
    });

    return Object.entries(counter).map(([filterCount, count]) => ({
      filterCount: parseInt(filterCount, 10),
      count
    })).sort((a, b) => a.filterCount - b.filterCount);
  }, [collections]);

  // === Dimensions ===
  const chartWidth = width / 3;                      // split 3 charts horizontally
  const headingHeight = height * 0.08;               // reserve 12% height for heading
  const chartHeight = height - headingHeight;        // remaining height for chart
  const fontSize = height * 0.04;                    // font size ~6% of container height
  const barSize = Math.max(5, chartWidth * 0.15);    // scale bar size

  return (
    <div style={{ width, height, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      
      {/* === Score Distribution === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Score Distribution</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={scoreData} margin={{ top: 0, right: width * 0.02, bottom: height * 0.02, left: -width * 0.07 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bin" tick={{ fontSize: fontSize * 0.6 }} angle={-15} interval={0} />
            <YAxis tick={{ fontSize: fontSize * 0.8 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={barSize} onClick={(data) => {
              onFilterSelected({ type: "score", bin: data.bin });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Type Variety === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Type Variety</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={typeData} margin={{ top: 0, right: width * 0.02, bottom: height * 0.02, left: -width * 0.07 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="numTypes" tick={{ fontSize: fontSize * 0.8 }} />
            <YAxis tick={{ fontSize: fontSize * 0.8 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={barSize} onClick={(data) => {
              onFilterSelected({ type: "type_count", value: data.numTypes });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Filter Count === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "0.5px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize }}>Filter Count</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={filterCountData} margin={{ top: 0, right: width * 0.02, bottom: height * 0.02, left: -width * 0.07 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="filterCount" tick={{ fontSize: fontSize * 0.8 }} />
            <YAxis tick={{ fontSize: fontSize * 0.8 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={barSize} onClick={(data) => {
              onFilterSelected({ type: "filter_count", count: data.filterCount });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

export default CollectionSummary;