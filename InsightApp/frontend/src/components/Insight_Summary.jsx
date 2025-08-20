// components/Insight_Summary.jsx
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid
} from "recharts";

const TYPE_METADATA = {
  "Dominance": ["SinglePoint", "#1f77b4"],
  "Outstanding Twin": ["SinglePoint", "#1f77b4"],
  "Evenness": ["SinglePoint", "#1f77b4"],
  "Change Point": ["SingleShape", "#ff7f0e"],
  "Trend": ["SingleShape", "#ff7f0e"],
  "Temporal Correlation": ["Compound", "#2ca02c"],
  "Correlation": ["Compound", "#2ca02c"],
};

const CATEGORY_ORDER = { SinglePoint: 0, SingleShape: 1, Compound: 2, Unknown: 3 };

function Insight_Summary({ width, height, selectedCollection }) {
  const insights = Array.isArray(selectedCollection?.insights)
    ? selectedCollection.insights
    : [];

  const panelW = width;
  const panelH = height;

  // Typography / margins
  const tickFont = Math.max(8, Math.min(panelW * 0.01, panelH * 0.02));
  const labelFont = Math.max(10, panelH * 0.06);
  const mTop = 0;
  const mRight = panelW * 0.06;
  const mLeft = -panelW * 0.06;
  const mBottom = 0;

  // Aggregate & Sort (by category group, then score desc, then count desc)
  const { pairedData, maxTotalScore, maxCount } = useMemo(() => {
    if (!insights.length) return { pairedData: [], maxTotalScore: 0, maxCount: 0 };

    const byType = new Map();
    for (const d of insights) {
      const t = d?.type ?? "Unknown";
      const s = Number(d?.score);
      const entry = byType.get(t) || { type: t, totalScore: 0, count: 0 };
      if (Number.isFinite(s)) entry.totalScore += s;
      entry.count += 1;
      byType.set(t, entry);
    }

    const arr = Array.from(byType.values());
    arr.sort((a, b) => {
      const catA = TYPE_METADATA[a.type]?.[0] || "Unknown";
      const catB = TYPE_METADATA[b.type]?.[0] || "Unknown";
      const orderA = CATEGORY_ORDER[catA] ?? 99;
      const orderB = CATEGORY_ORDER[catB] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.count - a.count;
    });

    const ms = arr.reduce((m, d) => Math.max(m, d.totalScore), 0);
    const mc = arr.reduce((m, d) => Math.max(m, d.count), 0);
    return { pairedData: arr, maxTotalScore: ms, maxCount: mc };
  }, [insights]);

  if (!selectedCollection) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 12 }}>
        Select a collection to see summary.
      </div>
    );
  }

  const hasData = pairedData.length > 0;
  const scoreDomainMax = Math.max(1, Math.ceil(maxTotalScore || 0));
  const countDomainMax = Math.max(1, Math.ceil(maxCount || 0));

  // =========================
  // Dynamic bar sizing (key!)
  // =========================
  // Inner plotting height (px)
  const innerH = Math.max(0, panelH - (mTop + mBottom));

  // Number of category rows
  const groups = Math.max(1, pairedData.length);

  // Gap between category rows (px)
  const groupGapPx = innerH * 0.09;

  // Gap between the two bars in the same group (px)
  const withinGroupGapPx = innerH * 0.01;

  // Height available per group after subtracting between-group gap
  const bandHeight = innerH / groups;
  const availableInBand = Math.max(0, bandHeight - groupGapPx);

  // Two bars per group → thickness each:
  const barThickness = Math.min(
    8,
    Math.floor((availableInBand - withinGroupGapPx) / 2)
  );

  return (
    <div style={{ width, height }}>
      <div style={{ width: panelW, height: panelH, background: "#fff", border: "1px solid #eee" }}>
        <div style={{ width: "100%", height: "100%" }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pairedData}
                layout="vertical"
                margin={{ top: mTop, right: mRight, left: mLeft, bottom: mBottom }}
                // These two control gaps in pixels:
                barCategoryGap={groupGapPx}
                barGap={withinGroupGapPx}
              >
                <CartesianGrid strokeDasharray="4 3" />

                {/* Y-axis categories */}
                <YAxis
                  type="category"
                  dataKey="type"
                  width={Math.max(80, panelW * 0.2)}
                  tick={{ fontSize: tickFont }}
                />

                {/* Top X-axis: Score */}
                <XAxis
                  xAxisId="score"
                  type="number"
                  domain={[0, scoreDomainMax]}
                  orientation="top"
                  tick={{ fontSize: tickFont }}
                  label={{ value: "Score (Sum within type)", position: "insideTop", offset: 4, fontSize: labelFont }}
                />

                {/* Bottom X-axis: Count */}
                <XAxis
                  xAxisId="count"
                  type="number"
                  domain={[0, countDomainMax]}
                  orientation="bottom"
                  tick={{ fontSize: tickFont }}
                  label={{ value: "Type Count", position: "insideBottom", offset: 2, fontSize: labelFont }}
                />

                <Tooltip
                  formatter={(value, name) => {
                    if (name === "totalScore") return [value, "Score (sum)"];
                    if (name === "count") return [value, "Count"];
                    return [value, name];
                  }}
                />

                {/* Score bars: ALWAYS grey; thickness from height math */}
                <Bar
                  name="Score (sum)"
                  dataKey="totalScore"
                  xAxisId="score"
                  barSize={barThickness}
                  isAnimationActive={false}
                  fill="#999999"
                  opacity={0.5}
                />

                {/* Count bars: colored per TYPE_METADATA; same thickness */}
                <Bar
                  name="Count"
                  dataKey="count"
                  xAxisId="count"
                  barSize={barThickness}
                  isAnimationActive={false}
                >
                  {pairedData.map((d, i) => {
                    const color = TYPE_METADATA[d.type]?.[1] || "#cccccc";
                    return <Cell key={`count-${i}`} fill={color} opacity={0.6} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
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
