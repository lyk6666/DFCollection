import React from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, Legend, ResponsiveContainer
} from "recharts";

function Explore_InsightDetails({ insight, position = { x, y }, size = { width, height } }) {
  if (!insight) return null;

  const { subspace, type, breakdown, measure, modified_dataset, score } = insight;

  const data = modified_dataset.map((row, index) => ({
    ...row,
    index,
  }));

  const renderChart = () => {
    if (!data || data.length === 0) return <p>No data available.</p>;

    const measureKey = Array.isArray(measure) ? measure[0] : measure;

    switch (type) {
      case "Dominance":
      case "Outstanding One":
      case "Outstanding Twin":
      case "Uniformity":
        return (
          <ResponsiveContainer width={size.width - 10} height={size.height - 30}>
            <BarChart 
              data={data}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={breakdown}
                interval={0}
                ticks={data.map(d => d[breakdown])}
                tick={{ fontSize: 8, angle: -10 }}
                label={{
                  value: breakdown,
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 12
                }}
              />
              <YAxis
                label={{
                  value: measureKey,
                  angle: -90,
                  position: "insideLeft",
                  offset: 5,
                  fontSize: 12
                }}
                tick={{ fontSize: 10 }}
              />
              <Tooltip />
              {/* <Legend /> */}
              <Bar dataKey={measureKey} fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        );

      case "Trend":
      case "Change Point":
      case "Evenness":
        return (
          <ResponsiveContainer width={size.width - 10} height={size.height - 30}>
            <LineChart
              data={data}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={breakdown}
                ticks={data.map(d => d[breakdown])}
                tick={{ fontSize: 8, angle: -15 }}
                label={{
                  value: breakdown,
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 12
                }}
              />
              <YAxis
                label={{
                  value: measureKey,
                  angle: -90,
                  position: "insideLeft",
                  offset: 5,
                  fontSize: 12
                }}
                tick={{ fontSize: 10 }}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={measureKey}
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case "Correlation":
        const [xKey, yKey] = measure
        return (
    <ResponsiveContainer width={size.width - 10} height={size.height - 30}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="index" 
          tick={{ fontSize: 10 }} 
          label={{
            value: breakdown,
            position: "insideBottom",
            offset: -2,
            fontSize: 12
          }}
        />
        <YAxis 
          label={{
            value: measure,
            angle: -90,
            position: "insideLeft",
            offset: 5,
            fontSize: 12
          }}
          tick={{ fontSize: 10 }}
        />
        <Tooltip />

        <Line 
          type="monotone" 
          dataKey={xKey} 
          stroke="#8884d8" 
          strokeWidth={2} 
          dot={false}
        />
        <Line 
          type="monotone" 
          dataKey={yKey} 
          stroke="#82ca9d" 
          strokeWidth={2} 
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
        );

      case "Cross-measure Correlation": {
        const [xKey, yKey] = measure;
        return (
          <ResponsiveContainer width={size.width - 10} height={size.height - 30}>
            <ScatterChart
              data={data}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"                // 🟢 Key change: numeric axis
                dataKey={xKey}
                name={xKey}
                tick={{ fontSize: 10 }}
                domain={['auto', 'auto']}    // auto range based on data
                label={{
                  value: xKey,
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 12
                }}
              />
              <YAxis
                type="number"
                dataKey={yKey}
                name={yKey}
                tick={{ fontSize: 10 }}
                domain={['auto', 'auto']}
                label={{
                  value: yKey,
                  angle: -90,
                  position: "insideLeft",
                  offset: 5,
                  fontSize: 12
                }}
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              {/* <Legend /> */}
              <Scatter name="Correlation" data={data} fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
        );
      }

      default:
        return <p>Unsupported insight type: {type}</p>;
    }
  };

  return (
    <>
      {/* Chart Container */}
      <div
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          background: "#fff",
          border: "1px solid #ccc",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: "bold",
            marginBottom: 6,
            color: "grey"
          }}
        >
          Insight Type: {type}
        </div>
        <div style={{ width: "100%", height: "100%" }}>{renderChart()}</div>
      </div>

      {/* Metadata Container (separate visual block) */}
      <div
        style={{
          position: "absolute",
          left: position.x,
          top: position.y + size.height + 5, // placed below the chart
          padding: 6,
          width: size.width - 12,
          background: "#f6f6f6",
          border: "1px solid #ccc",
          fontSize: 8,
          color: "grey",
        }}
      >
        <div><strong>Breakdown:</strong> {breakdown}</div>
        <div><strong>Measure:</strong> {Array.isArray(measure) ? measure.join(", ") : measure}</div>
        <div><strong>Score:</strong> {score?.toFixed(3)}</div>
        <div>
          <strong>Subspace:</strong>{" "}
          {"{" + Object.entries(subspace || {})
            .filter(([_, value]) => value !== "*")
            .map(([_, value]) => value)
            .join(", ") + "}"}
        </div>
      </div>
    </>
  );

}

export default Explore_InsightDetails;