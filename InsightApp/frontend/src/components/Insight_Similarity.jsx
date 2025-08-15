import React, { useEffect, useState, useRef, useMemo } from "react";
import DominanceIcon from "../assets/icons/Dominance.svg";
import OutstandingTwinIcon from "../assets/icons/OutstandingTwin.svg";
import EvennessIcon from "../assets/icons/Evenness.svg";
import ChangePointIcon from "../assets/icons/ChangePoint.svg";
import TrendIcon from "../assets/icons/Trend.svg";
import TemporalCorrelationIcon from "../assets/icons/TemporalCorrelation.svg";
import CorrelationIcon from "../assets/icons/Correlation.svg";

const ICONS = {
  "Dominance": DominanceIcon,
  "Outstanding Twin": OutstandingTwinIcon,
  "Evenness": EvennessIcon,
  "Change Point": ChangePointIcon,
  "Trend": TrendIcon,
  "Temporal Correlation": TemporalCorrelationIcon,
  "Correlation": CorrelationIcon,
}

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


  const insightKey = (i) =>
    JSON.stringify({
      type: i?.type,
      breakdown: i?.breakdown,
      subspace: i?.subspace,
      measure: Array.isArray(i?.measure) ? [...i.measure].sort() : [i?.measure],
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
        const iconUrl = ICONS[insight.type]; // look up the matching SVG
        const isSelected = (insightKey(insight) === insightKey(selectedInsight));
        const isLargest = largestPerColor[insight.color]?.id === insight.id;

        const cx = scaleX(insight.x);
        const cy = scaleY(insight.y);
        const r = scaleR(insight.r);

        const fillColor = isSelected
          ? adjustColorBrightness(insight.color, 0)
          : adjustColorBrightness(insight.color, 80);

        return (
          <g
            key={insight.id}
            onClick={() => {
              onInsightClick?.(insight);
              console.log("Clicked insight in Similarity:", insight);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onInsightClick?.(insight);
              }
            }}
            style={{ cursor: "pointer" }}
            aria-label={`Insight ${insight.type}`}
          >
            {/* Outer colored circle */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fillColor}
              stroke="#333"
              strokeWidth={Math.min(width, height) * 0.001}
            />

            {/* Inner white circle as icon holder */}
            <circle
              cx={cx}
              cy={cy}
              r={r * 0.8}
              fill="white"
              pointerEvents="none"
            />

            {/* Optional: clip to the inner circle so the SVG never spills out */}
            {/* <defs>
              <clipPath id={`clip-${insight.id}`}>
                <circle cx={cx} cy={cy} r={r * 0.8} />
              </clipPath>
            </defs> */}

            {/* Icon image centered inside */}
            {iconUrl && (
              <image
                href={iconUrl}
                x={cx - r * 0.6}
                y={cy - r * 0.6}
                width={r * 1.2}
                height={r * 1.2}
                preserveAspectRatio="xMidYMid meet"
                clipPath={`url(#clip-${insight.id})`}
                pointerEvents="none"
              />
            )}

            <title>
              {`Type: ${insight.type}
Group: ${insight.group}
Score: ${insight.score?.toFixed(3)}
Measure: ${Array.isArray(insight.measure) ? insight.measure.join(", ") : insight.measure}`}
            </title>
          </g>
        );
      })}

      {/* Connecting lines between nearby circles */}
      {/* {positionedInsights.flatMap((a, i) =>
        positionedInsights.slice(i + 1).map((b) => {
          const ax = scaleX(a.x);
          const ay = scaleY(a.y);
          const ar = scaleR(a.r);

          const bx = scaleX(b.x);
          const by = scaleY(b.y);
          const br = scaleR(b.r);

          const dx = bx - ax;
          const dy = by - ay;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Adjust this factor to control when circles are "connected"
          const threshold = ar + br + 20;

          if (distance <= threshold) {
            return (
              <line
                key={`line-${a.id}-${b.id}`}
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke="#ccc"
                strokeWidth={Math.min(width, height) * 0.002}
              />
            );
          }
          return null;
        })
      )} */}
    </svg>
  );
}

export default InsightSimilarity;
