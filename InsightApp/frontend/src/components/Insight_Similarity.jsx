import React, { useEffect, useState, useRef } from "react";

function InsightSimilarity({ width, height, collection, onInsightClick, onLayoutReady, onLegendReady, onTypeLegendReady, onLargestReady, polygonLayout }) {
  const svgRef = useRef(null);
  const [positionedInsights, setPositionedInsights] = useState([]);
  
  function isMatchingInsight(a, b) {
    return (
      a.type === b.type &&
      a.breakdown === b.breakdown &&
      shallowEqualObjects(a.subspace, b.subspace) &&
      arraysEqualUnordered(toArray(a.measure), toArray(b.measure))
    );
  }

  function shallowEqualObjects(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    return keys1.every(key => obj2.hasOwnProperty(key) && obj1[key] === obj2[key]);
  }

  function arraysEqualUnordered(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    return sorted1.every((val, i) => val === sorted2[i]);
  }

  function toArray(val) {
    return Array.isArray(val) ? val : [val];
  }

  useEffect(() => {
    if (!collection || !Array.isArray(collection.insights)) return;

    fetch("http://localhost:5000/api/insight_similarity_layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insights: collection.insights })
    })
      .then(res => res.json())
      .then((data) => {
        setPositionedInsights(data);

        // ✅ Compute largestPerColor directly from fresh data
        const largestPerColor = {};
        data.forEach(insight => {
          const color = insight.color;
          if (!largestPerColor[color] || insight.r > largestPerColor[color].r) {
            largestPerColor[color] = insight;
          }
        });

        // ✅ Now enrich BEFORE passing to setLargestInsights:
        const enrichedLargest = Object.values(largestPerColor).map(glyphInsight => {
          const fullInsight = polygonLayout?.find(p => isMatchingInsight(p, glyphInsight));
          return fullInsight ? { ...glyphInsight, modified_dataset: fullInsight.modified_dataset } : glyphInsight;
        });
        onLargestReady(enrichedLargest);

        // Extract legend data here
        const legendData = generateLegendData(data);
        if (onLegendReady) {
          onLegendReady(legendData);
        }

        const typeLegendData = generateTypeLegendData(data);
        if (onTypeLegendReady) {
          onTypeLegendReady(typeLegendData);
        }

        // Send absolute position to Explore
        requestAnimationFrame(() => {
          if (onLayoutReady && svgRef.current) {
            const glyphRect = svgRef.current.getBoundingClientRect();
            const exploreSVG = document.querySelector("#explore-overlay-svg");
            const exploreRect = exploreSVG.getBoundingClientRect();

            const layout = data.map(d => ({
              ...d,
              x: d.x * width + glyphRect.left - exploreRect.left,
              y: d.y * height + glyphRect.top - exploreRect.top
            }));
            onLayoutReady(layout);
          }
        });
      })
      .catch(err => console.error("Error fetching insight layout:", err));
  }, [collection, onLayoutReady, polygonLayout]);

  function generateLegendData(insights) {
    const groupMap = new Map();

    insights.forEach(insight => {
      const { group, color } = insight;
      if (group && color && !groupMap.has(group)) {
        groupMap.set(group, color);
      }
    });

    return Array.from(groupMap.entries()).map(([group, color]) => ({
      group,
      color,
    }));
  }

  function generateTypeLegendData(insights) {
    const typeMap = new Map();

    insights.forEach(insight => {
      const { type, icon } = insight;
      if (type && icon && !typeMap.has(type)) {
        typeMap.set(type, icon);
      }
    });

    return Array.from(typeMap.entries()).map(([type, icon]) => ({
      type,
      icon,
    }));
  }

  const scaleX = (x) => x * width;
  const scaleY = (y) => y * height;

  const rr = width < height ? width : height;

  const scaleR = (r) => r * rr;

  const largestPerColor = {};
  positionedInsights.forEach(insight => {
    const color = insight.color;
    if (!largestPerColor[color] || insight.r > largestPerColor[color].r) {
      largestPerColor[color] = insight;
    }
  });

  return (
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          background: "white",
        }}
      >

      {/* Draw grid */}
      {[...Array(21)].map((_, i) => {
        const posH = i * (width / 20);
        const posW = i * (height / 20);
        return (
          <g key={i}>
            {/* Vertical lines */}
            <line x1={posH} y1={0} x2={posH} y2={height} stroke="#ddd" strokeWidth={1} />
            {/* Horizontal lines */}
            <line x1={0} y1={posW} x2={width} y2={posW} stroke="#ddd" strokeWidth={1} />
          </g>
        );
      })}

      {positionedInsights.map((insight) => {
      const cx = scaleX(insight.x);
      const cy = scaleY(insight.y);
      const r = scaleR(insight.r);
      const isLargest = largestPerColor[insight.color].id === insight.id;
      
      return (
        <g key={insight.id}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={insight.color}
            opacity={isLargest ? 0.9 : 0.4}
            stroke="#333"
            strokeWidth={0.5}
            onClick={() => {
              const svgRect = svgRef.current.getBoundingClientRect();
              const exploreSVG = document.querySelector("#explore-overlay-svg");
              const exploreRect = exploreSVG.getBoundingClientRect();

              const relativeX = cx + svgRect.left - exploreRect.left;
              const relativeY = cy + svgRect.top - exploreRect.top;
              
              console.log("clicked insight: ", insight);

              onInsightClick?.({
                ...insight,
                position: { x: relativeX, y: relativeY }
              });
            }}
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