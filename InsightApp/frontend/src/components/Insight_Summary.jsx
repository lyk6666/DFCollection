// components/Insight_Summary.jsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

function Insight_Summary({ width, height, selectedCollection }) {
  const insights = Array.isArray(selectedCollection?.insights)
    ? selectedCollection.insights
    : [];

  // ----- Layout decisions (responsive) -----
  const isWide = width > height * 1.2; // side-by-side if wide, else stacked
  const gap = Math.max(8, Math.min(16, Math.floor(Math.min(width, height) * 0.02)));
  const panelW = isWide ? (width - gap) / 2 : width;
  const panelH = isWide ? height : (height - gap) / 2;

  // Scaled typography/margins
  const tickFont = Math.max(9, Math.min(panelW * 0.022, panelH * 0.06));
  const labelFont = Math.max(10, panelH * 0.06);
  const mTop = Math.max(8, panelH * 0.06);
  const mRight = Math.max(6, panelW * 0.04);
  const mLeft = Math.max(6, panelW * 0.06);
  const mBottom = Math.max(8, panelH * 0.08);

  // ----- Score histogram (0..1, 10 bins) -----
  const scoreData = useMemo(() => {
    if (!insights.length) return [];
    const scores = insights
      .map(d => Number(d?.score))
      .filter(v => Number.isFinite(v));

    if (!scores.length) return [];

    const bins = 10;
    const counts = Array.from({ length: bins }, () => 0);
    scores.forEach(s => {
      let idx = Math.floor(s * bins);
      if (idx >= bins) idx = bins - 1; // clamp 1.0 to last bin
      if (idx < 0) idx = 0;
      counts[idx]++;
    });

    return counts.map((c, i) => {
      const start = (i / bins).toFixed(1);
      const end = ((i + 1) / bins).toFixed(1);
      return { bin: `${start}–${end}`, count: c, start: i / bins, end: (i + 1) / bins };
    });
  }, [insights]);

  // ----- Type distribution -----
  const typeData = useMemo(() => {
    if (!insights.length) return [];
    const map = new Map();
    insights.forEach(d => {
      const t = d?.type ?? "Unknown";
      map.set(t, (map.get(t) || 0) + 1);
    });
    // sort desc
    return Array.from(map.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [insights]);

  const palette = ["#8884d8", "#82ca9d", "#ffc658", "#8dd1e1", "#a4de6c", "#d0ed57", "#ff9f80", "#bfa8ff", "#80b1d3", "#fdb462"];

  // ----- Panels -----
  const ScorePanel = (
    <div style={{ width: panelW, height: panelH, background: "#fff", border: "1px solid #eee" }}>
      <div style={{ padding: `${Math.max(6, panelH * 0.04)}px ${Math.max(8, panelW * 0.03)}px`, fontSize: Math.max(12, panelH * 0.08), fontWeight: 600, color: "#555" }}>
        Score Distribution
      </div>
      <div style={{ width: "100%", height: `calc(100% - ${Math.max(6, panelH * 0.04) + 2}px)` }}>
        {scoreData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scoreData} margin={{ top: mTop, right: mRight, left: mLeft, bottom: mBottom }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="bin"
                tick={{ fontSize: tickFont }}
                label={{ value: "Score (0–1)", position: "insideBottom", offset: 2, fontSize: labelFont }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: tickFont }}
                label={{ value: "Count", angle: -90, position: "insideLeft", offset: 5, fontSize: labelFont }}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );

  const TypePanel = (
    <div style={{ width: panelW, height: panelH, background: "#fff", border: "1px solid #eee" }}>
      <div style={{ padding: `${Math.max(6, panelH * 0.04)}px ${Math.max(8, panelW * 0.03)}px`, fontSize: Math.max(12, panelH * 0.08), fontWeight: 600, color: "#555" }}>
        Type Distribution
      </div>
      <div style={{ width: "100%", height: `calc(100% - ${Math.max(6, panelH * 0.04) + 2}px)` }}>
        {typeData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeData} layout="vertical" margin={{ top: mTop, right: mRight, left: mLeft, bottom: mBottom }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: tickFont }}
                label={{ value: "Count", position: "insideBottom", offset: 2, fontSize: labelFont }}
              />
              <YAxis
                type="category"
                dataKey="type"
                width={Math.max(60, panelW * 0.22)}
                tick={{ fontSize: tickFont }}
              />
              <Tooltip />
              <Bar dataKey="count">
                {typeData.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );

  if (!selectedCollection) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 12 }}>
        Select a collection to see summary.
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: isWide ? "row" : "column",
        gap,
      }}
    >
      {ScorePanel}
      {TypePanel}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>
      No data available.
    </div>
  );
}

export default Insight_Summary;
