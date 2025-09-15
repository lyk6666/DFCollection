import React, { useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
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

  // --- Minimal slider (no controls). We keep a ref so the parent could scroll if ever needed.
  const sliderRef = useRef(null);

  const hasHistory = Array.isArray(history) && history.length > 0;

  const renderPanel = (insight, collection, showShotBtn = false, showMeta = false, sequence) => {
    if (!insight) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: "#888" }}>
          Click an insight to see details here.
        </div>
      );
    }

    // ------- per-panel sizing -------
    const titleH = showMeta ? cellH * 0.10 : cellH * 0.10; // taller for current
    const metaH  = showMeta ? cellH * 0.15 : cellH * 0.1;            // only current shows meta
    const innerXPad = pad * 2;

    const localChartW = Math.max(0, cellW - innerXPad);
    const localChartH = Math.max(40, cellH - innerXPad - titleH - metaH);

    const XaxisOffset = localChartH * 0.05; // offset for X axis label
    const YaxisOffset = localChartW * 0.1

    // fonts/margins proportional to local panel
    const tickFont       = Math.max(3, Math.min(localChartW * 0.02, localChartH * 0.06));
    const axisLabelFont  = Math.max(4, localChartH * 0.04);
    const commonMargins  = { top: 0, right: width * 0.02, left: -width * 0.02, bottom: 0 };
    const TCMargins = {top: 0, right: -width * 0.015, left: -width * 0.015, bottom: 0}

    const {
      subspace = {},
      type,
      breakdown,
      measure,
      modified_dataset = [],
      score,
      significance
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
              paddingBottom: localChartH * 0.03,
              paddingTop: localChartH * 0.01,
              textAlign: "center",
              fontSize: width * 0.01,
              color: "grey"
            }}
          >
            {typeof sequence === "number" ? `History ${sequence + 1}: ${type}` : type}
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
        case "Dominance": {
          // Regular pie chart for Dominance
          const generateBlueShades = (count) => {
            const start = { r: 90, g: 216, b: 230 }; // light blue (lightsteelblue)
            const end = { r: 30, g: 144, b: 200 };    // dodgerblue
            return Array.from({ length: count }, (_, i) => {
              const ratio = i / Math.max(1, (count - 1));
              const r = Math.round(start.r + (end.r - start.r) * ratio);
              const g = Math.round(start.g + (end.g - start.g) * ratio);
              const b = Math.round(start.b + (end.b - start.b) * ratio);
              return `rgb(${r},${g},${b})`;
            });
          };

          const colors = generateBlueShades(data.length);

          const RADIAN = Math.PI / 180;
          const labelFontSize = Math.min(localChartW * 0.06, localChartH * 0.06);

          const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, percent, name }) => {
            const radius = outerRadius * 1.05; // slightly outside the pie
            const x = cx + radius * Math.cos(-midAngle * RADIAN);
            const y = cy + radius * Math.sin(-midAngle * RADIAN);

            return (
              <text
                x={x}
                y={y}
                fill="#333"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelFontSize}
              >
                {`${name} (${(percent * 100).toFixed(1)}%)`}
              </text>
            );
          };

          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <PieChart>
                <Tooltip />
                <Pie
                  data={data}
                  dataKey={measureKey}
                  nameKey={breakdown}
                  labelLine={false}
                  cx="50%"
                  cy="45%"
                  outerRadius={Math.min(localChartW, localChartH) * 0.4}
                  paddingAngle={1}
                  label={renderCustomLabel}
                  isAnimationActive={false}
                >
                  {data.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          );
        }

        case "Outstanding Twin":
        case "Evenness":
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <BarChart data={data} margin={commonMargins}>
                {/* <CartesianGrid strokeDasharray="3 3" /> */}
                <XAxis
                  dataKey={breakdown}
                  interval={0}
                  ticks={data.map(d => d[breakdown])}
                  tick={{ fontSize: tickFont, angle: -10 }}
                  label={{ value: breakdown, position: "insideBottom", offset: XaxisOffset, fontSize: axisLabelFont }}
                />
                <YAxis
                  tick={{ fontSize: tickFont }}
                  textAnchor="middle"
                  label={{ value: measureKey, angle: -90, position: "insideLeft", offset: YaxisOffset, fontSize: axisLabelFont }}
                />
                <Tooltip />
                <Bar dataKey={measureKey} fill="#4682B4" isAnimationActive={false}/>
              </BarChart>
            </ResponsiveContainer>
          );

        case "Trend":
        case "Change Point":
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <LineChart data={data} margin={commonMargins}>
                {/* <CartesianGrid strokeDasharray="3 3" /> */}
                <XAxis
                  dataKey={breakdown}
                  ticks={data.map(d => d[breakdown])}
                  tick={{ fontSize: tickFont, angle: -10 }}
                  label={{ value: breakdown, position: "insideBottom", offset: XaxisOffset, fontSize: axisLabelFont }}
                />
                <YAxis
                  tick={{ fontSize: tickFont }}
                  label={{ value: measureKey, angle: -90, position: "insideLeft", offset: YaxisOffset, fontSize: axisLabelFont }}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={measureKey}
                  stroke="#D4A017"
                  strokeWidth={2}
                  dot={{ r: 0 }}
                  activeDot={{ r: Math.max(3, localChartW * 0.008) }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          );

        case "Skewness": {
          // Area chart emphasizes distribution shape for skewness insights
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <AreaChart data={data} margin={commonMargins}>
                {/* optional grid if you like: <CartesianGrid strokeDasharray="3 3" /> */}
                <defs>
                  <linearGradient id="skewFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D4A017" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#D4A017" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey={breakdown}
                  ticks={data.map(d => d[breakdown])}
                  tick={{ fontSize: tickFont, angle: -10 }}
                  label={{ value: breakdown, position: "insideBottom", offset: XaxisOffset, fontSize: axisLabelFont }}
                />
                <YAxis
                  tick={{ fontSize: tickFont }}
                  label={{ value: measureKey, angle: -90, position: "insideLeft", offset: YaxisOffset, fontSize: axisLabelFont }}
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey={measureKey}
                  stroke="#D4A017"
                  strokeWidth={1}
                  strokeOpacity={0.75}
                  fill="url(#skewFill)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          );
        }

        case "Temporal Correlation": {
          const [xKey, yKey] = Array.isArray(measure) ? measure : [measure, measure];
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <LineChart data={data} margin={TCMargins}>
                {/* <CartesianGrid strokeDasharray="3 3" /> */}
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: tickFont }}
                  label={{ value: breakdown, position: "insideBottom", offset: XaxisOffset, fontSize: axisLabelFont }}
                />

                {/* LEFT Y-AXIS for the first line */}
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: tickFont }}
                  label={{
                    value: xKey,
                    angle: -90,
                    position: "insideLeft",
                    offset: YaxisOffset,
                    fontSize: axisLabelFont
                  }}
                />

                {/* RIGHT Y-AXIS for the second line */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: tickFont }}
                  label={{
                    value: yKey,
                    angle: 90,
                    position: "insideRight",
                    offset: YaxisOffset,
                    fontSize: axisLabelFont
                  }}
                />

                <Tooltip />

                {/* Bind each line to its axis */}
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey={xKey}
                  stroke="#2E7D32"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey={yKey}
                  stroke="#6be46fff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          );
        }


        case "Correlation": {
          const [xKey, yKey] = Array.isArray(measure) ? measure : [measure, measure];
          return (
            <ResponsiveContainer width={localChartW} height={localChartH}>
              <ScatterChart data={data} margin={commonMargins}>
                {/* <CartesianGrid strokeDasharray="3 3" /> */}
                <XAxis
                  type="number"
                  dataKey={xKey}
                  name={xKey}
                  domain={["auto", "auto"]}
                  tick={{ fontSize: tickFont }}
                  label={{ value: xKey, position: "insideBottom", offset: XaxisOffset, fontSize: axisLabelFont }}
                />
                <YAxis
                  type="number"
                  dataKey={yKey}
                  name={yKey}
                  domain={["auto", "auto"]}
                  tick={{ fontSize: tickFont }}
                  label={{ value: yKey, angle: -90, position: "insideLeft", offset: YaxisOffset, fontSize: axisLabelFont }}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={data} fill="#2E7D32" isAnimationActive={false}/>
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
          fontSize: localChartW * 0.02,
          color: "grey",
          borderTop: "1px solid #eee",
          overflow: "hidden",
        }}
      >
        <div><strong>Breakdown:</strong> {breakdown}</div>
        {/* <div><strong>Measure:</strong> {Array.isArray(measure) ? measure.join(", ") : measure}</div> */}
        {/* <div><strong>Significance: </strong>{significance?.toFixed?.(6)}</div> */}
        <div><strong>Score:</strong> {score?.toFixed?.(6)}</div>
        <div>
          <strong>Filter Set:</strong>{" "}
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

  // Build the full history items list for the slider (NO slicing — renders ALL)
  const historyItems = useMemo(() => {
    return (history || []).map((item, i) => (
      <div
        key={i}
        style={{
          ...cellStyle,
          minWidth: cellW,
          width: cellW,
          height: cellH,
          scrollSnapAlign: "start",
        }}
      >
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
                  width: cellW * 0.30,
                  height: cellH * 0.40,
                  objectFit: "contain",
                  border: "1px solid #ddd",
                  background: "#fff",
                  boxShadow: "0 3px 3px rgba(0,0,0,0.2)",
                  opacity: 0.75,
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
    ));
  }, [history, cellH, cellW]);

  return (
    <div style={{ width, height, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap }}>
      {/* Current View with Shot button + meta (shorter chart) */}
      <div style={cellStyle}>
        {renderPanel(currentInsight, currentCollection, true, true)}
      </div>

      {/* History slider spanning the remaining 3 columns */}
      <div style={{ ...cellStyle, gridColumn: "span 3", width: cellW * 3 }}>
        {/* Scrollable row of ALL history cards — no controls */}
        <div
          ref={sliderRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            overflowX: "auto",
            overflowY: "hidden",
            display: "flex",
            gap: gap,
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {hasHistory ? historyItems : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", color: "#888", fontSize: 12 }}>
              No history yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HistoryView;
