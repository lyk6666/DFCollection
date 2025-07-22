import React, { useState, useEffect, useCallback } from "react";
import ExplorePolygonSplit from "./Explore_PolygonSplit";
import ExploreInsightDetails from "./Explore_InsightDetails";
import ExploreInsightGlyphLayout from "./Explore_InsightGlyphLayout";

function Explore({ width, height, collection, filterOrder, setFilterOrder, sectionData }) {
  const [clickedInsight, setClickedInsight] = useState(null);
  const [glyphLayout, setGlyphLayout] = useState([]);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [polygonLayout, setPolygonLayout] = useState([]);
  const handlePolygonLayoutReady = useCallback((layout) => {
    setPolygonLayout(layout);
  }, []);
  const [glyphClickedInsight, setGlyphClickedInsight] = useState(null);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleGlyphLayoutReady = useCallback((layout) => {
    setGlyphLayout(layout);
  }, []);

  const handlePolygonInsightClick = useCallback((insightWithPosition) => {
    setClickedInsight(insightWithPosition);
    setGlyphClickedInsight(null); // reset
  }, []);

  const handleGlyphInsightClick = useCallback((insightWithPosition) => {
    setGlyphClickedInsight(insightWithPosition);
    setClickedInsight(null); // reset
  }, []);

  // Helper to compare arrays ignoring order
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

  const renderLinkLines = () => {
    if (!clickedInsight || glyphLayout.length === 0) return null;

    console.log("clickedInsight position:", clickedInsight.position);

    const matched = glyphLayout.filter(glyph =>
      isMatchingInsight(clickedInsight, glyph)
    );

    console.log("matched pair: ", matched);

    return matched.map((glyph, i) => {
      console.log("From:", clickedInsight.position.x, clickedInsight.position.y);
      console.log("To:", glyph.x, glyph.y); // ✅ Log here

      return (
        <line
          key={`line-${i}`}
          x1={clickedInsight.position.x}
          y1={clickedInsight.position.y}
          x2={glyph.x}
          y2={glyph.y}
          stroke="grey"
          strokeDasharray="4,2"
          strokeWidth={2}
          opacity={0.5}
        />
      );
    });
  };

  const renderReverseLinkLines = () => {
    if (!glyphClickedInsight || polygonLayout.length === 0) return null;

    const matched = polygonLayout.filter(p =>
      isMatchingInsight(glyphClickedInsight, p)
    );

    return matched.map((poly, i) => (
      <line
        key={`reverse-line-${i}`}
        x1={glyphClickedInsight.position.x}
        y1={glyphClickedInsight.position.y}
        x2={poly.x}
        y2={poly.y}
        stroke="grey"
        strokeWidth={2}
        opacity={0.5}
        strokeDasharray="4,2"
      />
    ));
  };

  const getCorrespondingPolygonInsight = (glyphInsight) => {
    if (!glyphInsight || polygonLayout.length === 0) return null;
    return polygonLayout.find(p => isMatchingInsight(p, glyphInsight));
  };

  const activeInsight = clickedInsight || getCorrespondingPolygonInsight(glyphClickedInsight);

  if (!collection) {
    return <div style={{ padding: 32 }}>Select a collection to explore details.</div>;
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div>
          <ExplorePolygonSplit
            collection={collection}
            filterOrder={filterOrder}
            setFilterOrder={setFilterOrder}
            sectionData={sectionData}
            onInsightClick={handlePolygonInsightClick}
            onLayoutReady={handlePolygonLayoutReady}
          />
        </div>

        <ExploreInsightGlyphLayout
          collection={collection}
          onInsightClick={handleGlyphInsightClick}
          onLayoutReady={handleGlyphLayoutReady}
          polygonLayout={polygonLayout}   // ✅ new
        />
      </div>

      <svg
        id="explore-overlay-svg" // Add this line
        width="100%"
        height={viewportHeight}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 99
        }}
      >
      {clickedInsight ? renderLinkLines() : renderReverseLinkLines()}

      </svg>

      {activeInsight && (
        <ExploreInsightDetails
          insight={activeInsight}
          position={{
            x: 702,
            y: 550
          }}
          size={{ width: 400, height: 300 }}
        />
      )}

    </div>
  );
}

export default Explore;
