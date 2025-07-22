import React from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, PieChart, Pie, Cell, ResponsiveContainer
} from "recharts";

function InsightMiniChart({ insight, width = 200, height = 150 }) {
  if (!insight || !insight.modified_dataset) return null;

  const { subspace, type, breakdown, measure, modified_dataset } = insight;
  const data = modified_dataset.map((row, index) => ({ ...row, index }));
  const measureKey = Array.isArray(measure) ? measure[0] : measure;

  if (!data || data.length === 0) return <p>No data</p>;

  const COLORS = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"];

  switch (type) {
    case "Dominance":{
  const pieData = data.map((d, i) => ({
    name: d[breakdown],
    value: d[measureKey]
  }));

  const renderCustomizedLabel = ({ name, cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + 2.2 * radius * Math.cos(-midAngle * RADIAN);
    const y = cy + 2.2 * radius * Math.sin(-midAngle * RADIAN);

    const angle = midAngle;  // angle in degrees

    return (
      <text
        x={x}
        y={y}
        fill="black"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}    // <<<<<< control font size here

      >
        {name}
      </text>
    );
  };

  return (
    <ResponsiveContainer width={width} height={height}>
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={Math.min(width, height) * 0.4}
          fill="#8884d8"
          labelLine={false}
          label={renderCustomizedLabel}
        >
          {pieData.map((entry, index) => {
            const maxValue = Math.max(...pieData.map(d => d.value));
            const isMax = entry.value === maxValue;
            return (
              <Cell
                key={`cell-${index}`}
                fill={isMax ? "#5EA9FF" : "#ccc"}
                opacity={isMax ? 1 : 0.4}
              />
            );
          })}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
    case "Outstanding One":
    case "Outstanding Twin":
    case "Uniformity":
      return (
        <ResponsiveContainer width={width} height={height}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={breakdown} tick={{ fontSize: 6, angle: -15, textAnchor: 'end' }} interval={0} />
            <YAxis tick={{ fontSize: 8 }} />
            <Bar dataKey={measureKey} fill="lightblue" />
          </BarChart>
        </ResponsiveContainer>
      );

    case "Trend":
    case "Change Point":
    case "Evenness":
      return (
        <ResponsiveContainer width={width} height={height}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={breakdown} tick={{ fontSize: 8 }} />
            <YAxis tick={{ fontSize: 8 }} />
            <Line type="monotone" dataKey={measureKey} stroke="#FFCC99" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );

    case "Correlation":
      const [xKey, yKey] = measure;
      return(
        <ResponsiveContainer width={width} height={height}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="index" tick={{ fontSize: 8 }} />
            <YAxis tick={{ fontSize: 8 }} />

            <Line 
              type="monotone" 
              dataKey={xKey} 
              stroke="#006600" 
              strokeWidth={1} 
              dot={false} 
            />
            <Line 
              type="monotone" 
              dataKey={yKey} 
              stroke="#4C9900" 
              strokeWidth={1} 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      )
    case "Cross-measure Correlation": {
      const [xKey, yKey] = measure;
      return (
        <ResponsiveContainer width={width} height={height}>
          <ScatterChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey={xKey} tick={{ fontSize: 8 }} />
            <YAxis type="number" dataKey={yKey} tick={{ fontSize: 8 }} />
            <Scatter data={data} fill="#8884d8" />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    default:
      return <p>Unsupported</p>;
  }
}

// If you want to render 3 charts horizontally (e.g., for demo/testing outside layout)
export function HorizontalMiniChartGroup({ insights }) {
  if (!Array.isArray(insights) || insights.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "flex-start",
      gap: "12px",
      width: "100%",
      padding: "8px",
      backgroundColor: "#fff", // ← modify this line
    }}>
      {insights.slice(0, 3).map((insight, idx) => (
        <div key={idx} style={{ width: "130px", height: "120px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#666", marginBottom: "2px" }}>
            {insight.type}
          </div>
          <InsightMiniChart insight={insight} width={120} height={100} />
        </div>
      ))}
    </div>
  );
}

export default InsightMiniChart;