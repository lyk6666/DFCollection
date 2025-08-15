import React from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ResponsiveContainer
} from "recharts";

function HistoryView({ width, height, currentInsight, currentCollection, history = [], onShot }) {
  const cols = 4;
  const gap = 0;
  const totalGap = gap * (cols - 1);
  const cellW = Math.max(0, (width - totalGap) / cols);
  const cellH = Math.max(0, height);

  const pad = 2;

  const cellStyle = {
    width: cellW,
    height: cellH,
    position: "relative",
    overflow: "hidden",
    border: "1px solid #e6e6e6",
    background: "#fff",
    boxSizing: "border-box" // makes border part of width/height
  };

  const renderPanel = (insight, collection, showShotBtn = false, showMeta = false, sequence) => {
    if (!insight) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: "#888" }}>
          Click an insight to see details here.
        </div>
      );
    }

    // ------- per-panel sizing -------
    const titleH = showMeta ? cellH * 0.10 : cellH * 0.08; // taller for current
    const metaH  = showMeta ? cellH * 0.15 : 0;            // only current shows meta
    const innerXPad = pad * 2;

    const localChartW = Math.max(0, cellW - innerXPad);
    const localChartH = Math.max(60, cellH - innerXPad - titleH - metaH);

    // fonts/margins proportional to local panel
    const tickFont       = Math.max(8, Math.min(localChartW * 0.02, localChartH * 0.06));
    const axisLabelFont  = Math.max(10, localChartH * 0.06);
    const commonMargins  = { top: 0, right: width * 0.02, left: -width * 0.02, bottom: 0 };

    const {
      subspace = {},
      type,
      breakdown,
      measure,
      modified_dataset = [],
      score,
    } = insight;

    const data = Array.isArray(modified_dataset)
      ? modified_dataset.map((row, index) => ({ ...row, index }))
      : [];

    const measureKey = Array.isArray(measure) ? measure[0] : measure;

    const title = (
      <div
        style={{
          height: titleH,
          padding: `${pad * 2}px ${pad * 2}px`,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
      >
        {showMeta ? (
          <div
            style={{
              flex: 1,
              paddingRight: localChartW * 0.2,
              textAlign: "center",
              fontSize: width * 0.01,
              color: "grey"
            }}
          >
            Current: {type}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              paddingRight: localChartW * 0.4,
              paddingBottom: localChartH * 0.02,
              paddingTop: localChartH * 0.01,
              textAlign: "center",
              fontSize: width * 0.01,
              color: "grey"
            }}
          >
            History {sequence + 1}: {type}
          </div>
        )}

        {showShotBtn && (
          <button
            onClick={onShot}
            disabled={!collection}
            style={{
              marginRight: 6,
              fontSize: width * 0.01,
              padding: "2px 8px",
              background: collection ? "#00bcd4" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: collection ? "pointer" : "not-allowed"
            }}
            title={collection ? "Save to history" : "Select a collection first"}
          >
            Shot
          </button>
        )}
      </div>
    );

    if (!data.length) {
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
          {title}
          <div style={{ flex: 1, padding: 12, fontSize: 12 }}>No data available.</div>
          {showMeta && (
            <div style={{ height: metaH, padding: pad, borderTop: "1px solid #eee" }} />
          )}
        </div>
      );
    }

    const renderChart = () => {
      switch (type) {
        case "Dominance":
        case "Outstanding One":
        case "Outstanding Twin":
        case "Uniformity":
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <BarChart data={data} margin={commonMargins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={breakdown}
                  interval={0}
                  ticks={data.map(d => d[breakdown])}
                  tick={{ fontSize: tickFont, angle: -10 }}
                  label={{ value: breakdown, position: "insideBottom", offset: 2, fontSize: axisLabelFont }}
                />
                <YAxis
                  tick={{ fontSize: tickFont }}
                  label={{ value: measureKey, angle: -90, position: "insideLeft", offset: 25, fontSize: axisLabelFont }}
                />
                <Tooltip />
                <Bar dataKey={measureKey} fill="#4682B4" />
              </BarChart>
            </ResponsiveContainer>
          );

        case "Trend":
        case "Change Point":
        case "Evenness":
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <LineChart data={data} margin={commonMargins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={breakdown}
                  ticks={data.map(d => d[breakdown])}
                  tick={{ fontSize: tickFont, angle: -15 }}
                  label={{ value: breakdown, position: "insideBottom", offset: 2, fontSize: axisLabelFont }}
                />
                <YAxis
                  tick={{ fontSize: tickFont }}
                  label={{ value: measureKey, angle: -90, position: "insideLeft", offset: 25, fontSize: axisLabelFont }}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={measureKey}
                  stroke="#4682B4"
                  strokeWidth={2}
                  dot={{ r: Math.max(2, localChartW * 0.006) }}
                  activeDot={{ r: Math.max(3, localChartW * 0.008) }}
                />
              </LineChart>
            </ResponsiveContainer>
          );

        case "Temporal Correlation": {
          const [xKey, yKey] = Array.isArray(measure) ? measure : [measure, measure];
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <LineChart data={data} margin={commonMargins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: tickFont }}
                  label={{ value: breakdown, position: "insideBottom", offset: 2, fontSize: axisLabelFont }}
                />
                <YAxis
                  tick={{ fontSize: tickFont }}
                  label={{
                    value: Array.isArray(measure) ? measure.join(" & ") : String(measure),
                    angle: -90, position: "insideLeft", offset: 25, fontSize: axisLabelFont
                  }}
                />
                <Tooltip />
                <Line type="monotone" dataKey={xKey} stroke="#4682B4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={yKey} stroke="#82ca9d" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          );
        }

        case "Correlation": {
          const [xKey, yKey] = Array.isArray(measure) ? measure : [measure, measure];
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <ScatterChart data={data} margin={commonMargins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey={xKey}
                  name={xKey}
                  domain={["auto", "auto"]}
                  tick={{ fontSize: tickFont }}
                  label={{ value: xKey, position: "insideBottom", offset: 2, fontSize: axisLabelFont }}
                />
                <YAxis
                  type="number"
                  dataKey={yKey}
                  name={yKey}
                  domain={["auto", "auto"]}
                  tick={{ fontSize: tickFont }}
                  label={{ value: yKey, angle: -90, position: "insideLeft", offset: 25, fontSize: axisLabelFont }}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={data} fill="#4682B4" />
              </ScatterChart>
            </ResponsiveContainer>
          );
        }

        default:
          return <div style={{ padding: 12, fontSize: 12 }}>Unsupported insight type: {type}</div>;
      }
    };

    const meta = (
      <div
        style={{
          height: metaH,
          padding: pad,
          fontSize: width * 0.005,
          color: "grey",
          borderTop: "1px solid #eee",
          overflow: "hidden",
        }}
      >
        <div><strong>Breakdown:</strong> {breakdown}</div>
        <div><strong>Measure:</strong> {Array.isArray(measure) ? measure.join(", ") : measure}</div>
        <div><strong>Score:</strong> {score?.toFixed?.(3)}</div>
        <div>
          <strong>Subspace:</strong>{" "}
          {"{" + Object.entries(subspace).filter(([_, v]) => v !== "*").map(([_, v]) => v).join(", ") + "}"}
        </div>
      </div>
    );

    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        {title}
        <div style={{ flex: 1, padding: `0 ${pad}px` }}>{renderChart()}</div>
        {showMeta && meta}
      </div>
    );
  };

  return (
    <div style={{ width, height, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap }}>
      {/* Current View with Shot button + meta (shorter chart) */}
      <div style={cellStyle}>
        {renderPanel(currentInsight, currentCollection, true, true)}
      </div>

      {/* 3 History panels (taller chart, no meta) */}
      {[0, 1, 2].map((i) => {
        const item = history[i];
				// console.log("History item:", i, item);
        return (
          <div key={i} style={cellStyle}>
            {item ? (
              <>
                {renderPanel(item.insight, item.collection, false, false, i)}

                {/* Thumbnail overlay */}
                {item.thumb && (
                  <img
                    src={item.thumb}
                    alt="Polygon snapshot"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      width: cellW * 0.40,
                      height: cellH * 0.45,
                      objectFit: "contain",
                      border: "1px solid #ddd",
                      background: "#fff",
                      boxShadow: "0 3px 3px rgba(0,0,0,0.2)"
                    }}
                  />
                )}
              </>
            ) : (
              <div style={{ padding: 12, fontSize: 12, color: "#888" }}>
                History {i + 1} (empty)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default HistoryView;
