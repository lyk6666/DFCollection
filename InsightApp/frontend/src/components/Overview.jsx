import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

function Overview({ insights, collections, width, height, onFilterSelected }) {

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

  const filterSpecifiedData = useMemo(() => {
    const counter = {};
    collections.forEach(coll => {
      coll.filter_set?.forEach(filter => {
        counter[filter] = (counter[filter] ?? 0) + 1;
      });
    });

    return Object.entries(counter).map(([filter, count]) => ({ filter, count }));
  }, [collections]);

  // Dimensions
  const chartWidth = width / 4;
  const chartHeight = height - 30;
  const fontSize = 10

  return (
    <div style={{ width: width, height: height, display: "flex", flexDirection: "row", overflow: "hidden" }}>
      
      {/* Each section gets a fixed width, no scroll, all in a single row */}
      {/* === Score Distribution === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "1px solid #ccc"}}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize: fontSize }}>Score Distribution</h4>
        <ResponsiveContainer width={chartWidth} height={chartHeight}>
          <BarChart data={scoreData} margin={{ top: 0, right: 10, bottom: 0, left: -30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bin" tick={{ fontSize: 5 }} interval={0} angle={-15} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={10} onClick={(data) => {
              onFilterSelected({ type: "score", bin: data.bin });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Type Variety === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "1px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize: fontSize }}>Type Variety</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={typeData} margin={{ top: 0, right: 10, bottom: 0, left: -30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="numTypes" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={10} onClick={(data) => {
              onFilterSelected({ type: "type_count", value: data.numTypes });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Filter Count === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "1px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize: fontSize }}>Filter Count</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={filterCountData} margin={{ top: 0, right: 10, bottom: 0, left: -30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="filterCount" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={10} onClick={(data) => {
              onFilterSelected({ type: "filter_count", count: data.filterCount });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Filter Specified === */}
      <div style={{ width: chartWidth, height: "100%", backgroundColor: "white", border: "1px solid #ccc" }}>
        <h4 style={{ color: "grey", textAlign: "center", fontSize: fontSize }}>Filter Specified</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={filterSpecifiedData} margin={{ top: 0, right: 10, bottom: 0, left: -30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="filter" tick={{ fontSize: 5, angle: -15 }} interval={0} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6699CC" barSize={10} onClick={(data) => {
              onFilterSelected({ type: "filter_specified", filter: data.filter });
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default Overview;
