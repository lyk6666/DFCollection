
import React, {useState} from "react";
import ExploreInsightGlyph from "./Insight_Similarity";  // ✅ import your original component
import InsightMiniChart, {HorizontalMiniChartGroup} from "./Explore_InsightMiniCharts";

function ExploreInsightGlyphLayout({ collection, onInsightClick, onLayoutReady, polygonLayout }) {
  const [legendData, setLegendData] = useState([]);
  const [typeLegendData, setTypeLegendData] = useState([]);
  const [largestInsights, setLargestInsights] = useState([]);
  const sortedLargest = [...largestInsights].sort((a, b) => {
    const groupOrder = ["SinglePoint", "SingleShape", "Compound"];
    return groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
  });

  return (
    <>

    <div style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      width: "690px",
      minHeight: "100px",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      gap: "12px",
      boxSizing: "border-box",
    }}>
      {largestInsights.length > 0 ? (
        <HorizontalMiniChartGroup insights={largestInsights} />
      ) : (
        <div style={{ fontSize: "10px", color: "#aaa" }}>Loading charts...</div>
      )}
    </div>

    <div style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: "400px",
      height: "550px",
      border: "1px solid #ccc", // outer container border for visualization
      backgroundColor: "#f9f9f9"
    }}>
      {/* Add SVG overlay for connections */}
      {/* <svg 
        width="750" 
        height="400" 
        style={{ position: "absolute", top: 0, left: 0, zIndex: 2, pointerEvents: "none" }}
      >
        {sortedLargest.length > 0 && sortedLargest.map((insight, idx) => {
          // Calculate left diagram position
          const leftX = 220;  // center of left area (250/2)
          const leftY = 65 + idx * 133;  // 130 = height of each diagram block roughly

          // Calculate glyph circle position inside 350x350 main chart
          const glyphX = 250 + insight.x * 400;   // left offset + scaled x
          const glyphY = insight.y * 350;         // directly scaled y

          return (
            <line
              key={`line-${idx}`}
              x1={leftX}
              y1={leftY}
              x2={glyphX}
              y2={glyphY}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      Left details area
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "250px",
        height: "400px",
        color: "black",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        gap: "1px",
      }}>
        {largestInsights.length > 0 ? (
          [...largestInsights].sort((a, b) => {
            const groupOrder = ["SinglePoint", "SingleShape", "Compound"];
            return groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
          }).map((insight, idx) => (
            <div key={idx} style={{ 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              border: "1px solid #ddd", 
              padding: "8px", 
              width: "90%"
            }}>
              <span style={{
                fontSize: "10px",
                color: "#666",
                textAlign: "center",
                lineHeight: "1"
              }}>
                {insight.type}
              </span>

              {/* <div style={{ width: "100%", height: "100px", marginTop: "5px" }}>
                <InsightMiniChart insight={insight} width={200} height={100} />
              </div>

            </div>
          ))
        ) : (
          <div>Loading...</div>
        )}
      </div> */}


      {/* Main chart area */}
      <div style={{
        position: "absolute",
        top: 50,
        left: 5,
        width: "390px",
        height: "440px",
        border: "1px solid #333",
        color: "black",
        zIndex: 1
      }}>
        <ExploreInsightGlyph
          collection={collection}
          onInsightClick={onInsightClick}
          onLayoutReady={onLayoutReady}
          onLegendReady={setLegendData}  // ✅ Pass legend data back
          onTypeLegendReady={setTypeLegendData}
          onLargestReady={setLargestInsights}
          polygonLayout={polygonLayout}   // ✅ new
        />
      </div>

      {/* Top legend */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "400px",
        height: "50px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "20px",
        
      }}>
          {legendData.length > 0 ? [...legendData]
            .sort((a, b) => {
              const groupOrder = ["SinglePoint", "SingleShape", "Compound"];
              return groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
            })
            .map((item, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: item.color,
                  border: "1px solid #555",
                  borderRadius: "2px",
                  opacity: 0.6
                }} />
                <span style={{ fontSize: "11px", color: "#333", opacity: 0.9 }}>{item.group}</span>
              </div>
          )) : <div>Loading legend...</div>}
      </div>

      {/* Type legend moved to bottom with wrapping */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "400px",
        minHeight: "60px",
        padding: "6px 8px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: "12px",
        boxSizing: "border-box",
      }}>
        {typeLegendData.length > 0 ? typeLegendData.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "40px", // consistent block size
              textAlign: "center",
              lineHeight: "1.1",
              wordWrap: "break-word"
            }}
          >
            <span style={{
              fontSize: "20px",
              color: "#666",
              wordBreak: "break-word"
            }}>
              {item.icon}
            </span>
            <span style={{
              fontSize: "8px",
              color: "#666",
              marginTop: "2px",
            }}>
              {item.type}
            </span>
          </div>
        )) : <div>Loading...</div>}
      </div>

    </div>
    </>
  );
}

export default ExploreInsightGlyphLayout;

