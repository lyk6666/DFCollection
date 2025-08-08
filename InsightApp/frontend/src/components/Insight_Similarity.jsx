import React, { useEffect, useState, useRef } from "react";

function InsightSimilarity({ width, height, collection, onInsightClick, selectedInsight }) {
  const svgRef = useRef(null);
  const [positionedInsights, setPositionedInsights] = useState([]);

  function adjustColorBrightness(hex, amount) {
    return '#' + hex.replace(/^#/, '').replace(/../g, color =>
      ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).slice(-2)
    );
  }

  useEffect(() => {
    if (!collection || !Array.isArray(collection.insights)) return;

    fetch("http://localhost:5000/api/insight_similarity_layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insights: collection.insights })
    })
      .then(res => res.json())
      .then(setPositionedInsights)
      .catch(err => console.error("Error fetching insight layout:", err));
  }, [collection]);

  const scaleX = (x) => x * width;
  const scaleY = (y) => y * height;
  const rr = Math.min(width, height);
  const scaleR = (r) => r * rr;

  // Find the largest insight per color
  const largestPerColor = {};
  positionedInsights.forEach(insight => {
    const color = insight.color;
    if (!largestPerColor[color] || insight.r > largestPerColor[color].r) {
      largestPerColor[color] = insight;
    }
  });

  return (
    <svg ref={svgRef} width="100%" height="100%" style={{ background: "white" }}>
      {/* Draw grid */}
      {[...Array(21)].map((_, i) => {
        const posH = i * (width / 20);
        const posW = i * (height / 20);
        return (
          <g key={i}>
            <line x1={posH} y1={0} x2={posH} y2={height} stroke="#ddd" strokeWidth={1} />
            <line x1={0} y1={posW} x2={width} y2={posW} stroke="#ddd" strokeWidth={1} />
          </g>
        );
      })}

      {positionedInsights.map((insight) => {
        const isSelected = selectedInsight?.id === insight.id;
        const isLargest = largestPerColor[insight.color]?.id === insight.id;

        const cx = scaleX(insight.x);
        const cy = scaleY(insight.y);
        const r = scaleR(insight.r);

        const fillColor = isSelected
          ? adjustColorBrightness(insight.color, -60)
          : adjustColorBrightness(insight.color, isLargest ? 40 : 40);

        return (
          <g key={insight.id}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fillColor}
              stroke="#333"
              strokeWidth={Math.min(width, height) * 0.001}
              onClick={() => onInsightClick?.(insight)}
              style={{ cursor: "pointer" }}
            />
            <text
              x={cx}
              y={cy + r * 0.3}
              fontSize={r}
              textAnchor="middle"
              fill="black"
              opacity={0.6}
              pointerEvents="none"
            >
              {insight.icon}
            </text>
            <title>
              {`Type: ${insight.type}
Group: ${insight.group}
Score: ${insight.score?.toFixed(3)}
Measure: ${Array.isArray(insight.measure) ? insight.measure.join(", ") : insight.measure}`}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

export default InsightSimilarity;
