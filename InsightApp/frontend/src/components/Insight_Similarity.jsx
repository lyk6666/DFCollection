import React, { useEffect, useState, useRef, useMemo } from "react";
import * as d3 from "d3";
import DominanceIcon from "../assets/icons/Dominance.svg";
import OutstandingTwinIcon from "../assets/icons/OutstandingTwin.svg";
import EvennessIcon from "../assets/icons/Evenness.svg";
import ChangePointIcon from "../assets/icons/ChangePoint.svg";
import TrendIcon from "../assets/icons/Trend.svg";
import TemporalCorrelationIcon from "../assets/icons/TemporalCorrelation.svg";
import CorrelationIcon from "../assets/icons/Correlation.svg";
import SkewnessIcon from "../assets/icons/Skewness.svg"

const ICONS = {
  "Dominance": DominanceIcon,
  "Outstanding Twin": OutstandingTwinIcon,
  "Evenness": EvennessIcon,
  "Change Point": ChangePointIcon,
  "Trend": TrendIcon,
  "Temporal Correlation": TemporalCorrelationIcon,
  "Correlation": CorrelationIcon,
  "Skewness": SkewnessIcon
};

function InsightSimilarity({ width, height, collection, onInsightClick, selectedInsight }) {
  const [positionedInsights, setPositionedInsights] = useState([]);

  function adjustColorBrightness(hex, amount) {
    return (
      "#" +
      hex
        .replace(/^#/, "")
        .replace(/../g, (color) =>
          ("0" + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).slice(-2)
        )
    );
  }

  useEffect(() => {
    if (!collection || !Array.isArray(collection.insights)) return;

    fetch("http://localhost:5000/api/insight_similarity_layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insights: collection.insights }),
    })
      .then((res) => res.json())
      .then(setPositionedInsights)
      .catch((err) => console.error("Error fetching insight layout:", err));
  }, [collection]);

  const scaleX = (x) => x * width;
  const scaleY = (y) => y * height;
  const rr = Math.min(width, height);

  const insightKey = (i) =>
    JSON.stringify({
      type: i?.type,
      breakdown: i?.breakdown,
      subspace: i?.subspace,
      measure: Array.isArray(i?.measure) ? [...i.measure].sort() : [i?.measure],
    });

  // -------------------------
  // d3.contourDensity OVERLAY
  // -------------------------
  // Build a dataset in pixel space (so contours line up with SVG coords).
  const densityData = useMemo(() => {
    return positionedInsights.map((d) => ({
      // Keep original normalized values (0..1) but we'll scale in the accessors
      x: d.x,
      y: d.y,
      // Optional weight: proportional to r or score; tweak as desired
      w: (d.score ?? 1),
    }));
  }, [positionedInsights]);

  // Create the density generator; bandwidth controls smoothing in pixels.
  const densityGenerator = useMemo(() => {
    const count = collection?.insights?.length ?? 0
    if (count <= 0) {
      return () => []
    }
    const r = 1 / count
    console.log("r: ", r)

    const bandwidthPx = Math.min(Math.min(width, height) * r * 6, 60); // ~5% of min dimension
    return d3
      .contourDensity()
      .x((d) => scaleX(d.x))
      .y((d) => scaleY(d.y))
      .weight((d) => d.w)
      .size([width, height])
      .bandwidth(bandwidthPx)
      .thresholds(10); // number of contour levels
  }, [collection, width, height]);

  const contours = useMemo(() => densityGenerator(densityData), [densityData, densityGenerator]);

  // Color scale for density levels (higher value → darker/stronger color)
  const densityMax = useMemo(() => (contours.length ? d3.max(contours, (c) => c.value) : 1), [contours]);
  const densityColor = useMemo(
    () => d3.scaleSequential(d3.interpolateGreys).domain([0, densityMax]),
    [densityMax]
  );

  return (
    <svg width="100%" height="100%" style={{ background: "white" }}>
      {/* =============================== */}
      {/* 1) DENSITY LAYER (behind nodes) */}
      {/* =============================== */}
      <g aria-label="density-contours" opacity={0.4}>
        {contours.map((contour, i) => (
          <path
            key={`contour-${i}`}
            d={d3.geoPath()(contour)}
            fill={densityColor(contour.value)}
            stroke="#000000ff"
            strokeWidth={0}   // this sets the edge width
            strokeOpacity={0.3} // make edges slightly transparent
          />
        ))}
      </g>

      {/* =============================== */}
      {/* 2) NODES + ICONS */}
      {/* =============================== */}
      {positionedInsights.map((insight) => {
        const iconUrl = ICONS[insight.type]; // look up the matching SVG
        const isSelected = insightKey(insight) === insightKey(selectedInsight);
        // const isLargest = largestPerColor[insight.color]?.id === insight.id;

        const cx = scaleX(insight.x);
        const cy = scaleY(insight.y);

        const N = collection?.insights?.length || 1;
        const r = Math.min(width, height) * (1 / N) ** 0.5 * 0.3;

        const fillColor = isSelected
          ? insight.color
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
            <circle cx={cx} cy={cy} r={r * 0.8} fill="white" pointerEvents="none" />

            {/* OPTIONAL: ClipPath to keep icon inside inner circle */}
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

            <title>{`Type: ${insight.type}\nGroup: ${insight.group}\nScore: ${insight.score?.toFixed(3)}\nMeasure: ${Array.isArray(insight.measure) ? insight.measure.join(", ") : insight.measure}`}</title>
          </g>
        );
      })}

      {/* (Optional) connecting lines omitted for clarity; keep your original if needed */}
    </svg>
  );
}

export default InsightSimilarity;
