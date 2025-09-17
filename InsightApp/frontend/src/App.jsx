import React, { useEffect, useState, useLayoutEffect, useRef } from "react";
import { toPng } from "html-to-image";

import CollectionVoronoi from "./components/Collection_Voronoi";
import CollectionSummary from "./components/Collection_Summary";
import InsightPolygon from "./components/Insight_Polygon";
import InsightSimilarity from "./components/Insight_Similarity";
import HistoryView from "./components/History_View";
import InsightSummary from "./components/Insight_Summary";
import UploadAndSelect from "./components/UploadAndSelect";

// Invisible capture button beside titles
function ShotButton({ onClick, title = "Save PNG shot" }) {
  return (
    <button
      aria-label={title}
      onClick={onClick}
      style={{
        position: "absolute",
        right: "8px",
        top: "6px",
        width: "20px",
        height: "20px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        opacity: 0, // Invisible as requested
      }}
    />
  );
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize(entry.contentRect);
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function App() {
  // ---------------- State ----------------
  const [collections, setCollections] = useState([]);
  const [valueSequence, setValueSequence] = useState({});
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [filterOrder, setFilterOrder] = useState([]);
  const [sectionData, setSectionData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [selectedOverviewFilter, setSelectedOverviewFilter] = useState([]);
  const [clickedInsight, setClickedInsight] = useState(null);

  // Keep history in App (most-recent first)
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem("dfc_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const handleFilterSelected = (filterInfo) => {
    setSelectedOverviewFilter(filterInfo);
  };

  // ---------------- Backend (unchanged; data only) ----------------
  const API_BASE = "http://127.0.0.1:5000";
  const [backendStage, setBackendStage] = useState("idle"); // idle | processing | ready | error
  const [backendMsg, setBackendMsg] = useState("");

  // Poll status
  useEffect(() => {
    let timer;
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/status`);
        const s = await r.json();
        setBackendStage(s.stage);
        setBackendMsg(s.message || "");
        if (s.stage !== "ready") timer = setTimeout(poll, 1200);
      } catch {
        timer = setTimeout(poll, 2000);
      }
    };
    poll();
    return () => clearTimeout(timer);
  }, []);

  // insights
  useEffect(() => {
    if (backendStage !== "ready") return;
    fetch(`${API_BASE}/api/insights`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(setInsights)
      .catch((err) => console.error("Error fetching insights:", err));
  }, [backendStage]);

  // collections
  useEffect(() => {
    if (backendStage !== "ready") return;
    fetch(`${API_BASE}/api/insight_collections`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(setCollections)
      .catch((err) => console.error("Error fetching insight collections:", err));
  }, [backendStage]);

  // value sequence
  useEffect(() => {
    if (backendStage !== "ready") return;
    fetch(`${API_BASE}/api/value_sequence`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(setValueSequence)
      .catch((err) => console.error("Error fetching value sequence:", err));
  }, [backendStage]);

  useEffect(() => {
    if (backendStage !== "ready") return;
    if (!selectedCollection) return;

    fetch(`${API_BASE}/api/collection_sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection_id: selectedCollection.id,
        filter_sequence: filterOrder,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP error! Status: ${r.status}`);
        return r.json();
      })
      .then(setSectionData)
      .catch((err) => {
        console.error("Error fetching collection sections:", err);
      });
  }, [backendStage, selectedCollection, filterOrder]);

  // ---------------- Layout constants ----------------
  const headerHeight = 5; // %
  const summaryWidth = 30; // %
  const summaryHeight = 25; // %
  const polygonWidth = 40; // %
  const polygonHeight = 68; // %
  const paddingX = 0.25; // vw
  const paddingY = 0.5; // vh

  // ---------------- Refs ----------------
  const appRef = useRef(null);            // whole app capture
  const headerRef = useRef(null);         // (optional) header area
  const summaryRef = useRef(null);
  const polygonRef = useRef(null);
  const insightSummaryRef = useRef(null);
  const voronoiRef = useRef(null);
  const similarityRef = useRef(null);
  const historyRef = useRef(null);

  // ---------------- PNG capture (frontend-only) ----------------
  const downloadDataUrl = (dataUrl, filename) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    // For Firefox, link must be in the document
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const captureNodeToPng = async (node, label) => {
    if (!node) return;

    // Use display pixel ratio for “what I see is what I get”
    // const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 2));
    const dpr = 4

    const dataUrl = await toPng(node, {
      pixelRatio: dpr,
      cacheBust: true,
      backgroundColor: "#ffffff",
      // Ensure exact on-screen size:
      width: node.clientWidth,
      height: node.clientHeight,
      // fontEmbedCSS can sometimes help with custom fonts; usually not needed.
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeLabel = (label || "shot").replace(/\s+/g, "_");
    const filename = `${stamp}__${safeLabel}.png`;
    downloadDataUrl(dataUrl, filename);
  };

  const captureSection = async (ref, label) => {
    if (!ref?.current) return;
    await captureNodeToPng(ref.current, label);
  };

  const captureWholeApp = async () => {
    if (!appRef.current) return;
    await captureNodeToPng(appRef.current, "Full-Interface");
  };

  // make History thumbnail shot (unchanged; keeps your history flow)
  const handleShot = async () => {
    if (!clickedInsight || !selectedCollection || !polygonRef.current) return;
    const node = polygonRef.current.querySelector("svg") || polygonRef.current;

    const thumb = await toPng(node, {
      pixelRatio: Math.max(1, Math.floor(window.devicePixelRatio || 2)),
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: node.clientWidth,
      height: node.clientHeight,
    });

    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      collection: selectedCollection,
      insight: clickedInsight,
      thumb, // data URL
    };

    setHistory((prev) => [snapshot, ...prev]);
  };

  // ---------------- Sizes ----------------
  const summarySize = useElementSize(summaryRef);
  const polygonSize = useElementSize(polygonRef);
  const insightSummarySize = useElementSize(insightSummaryRef);
  const voronoiSize = useElementSize(voronoiRef);
  const similaritySize = useElementSize(similarityRef);
  const historySize = useElementSize(historyRef);

  // ---------------- Computed layout ----------------
  const insightSummaryWidth = 100 - summaryWidth - polygonWidth;
  const collectionVoronoiHeight = 100 - headerHeight - summaryHeight;
  const historyHeight = 100 - headerHeight - polygonHeight;
  const insightSimilarityHeight = 100 - summaryHeight - historyHeight - headerHeight;

  const insightSummaryLeft = summaryWidth + polygonWidth;
  const insightSimilarityTop = headerHeight + summaryHeight;
  const historyTop = 100 - historyHeight;
  const collectionVoronoiTop = headerHeight + summaryHeight;

  const sectionStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingTop: `${paddingY}vh`,
    paddingLeft: `${paddingX}vw`,
    paddingRight: `${paddingX}vw`,
    boxSizing: "border-box",
    position: "absolute",
    overflow: "hidden",
  };

  const titleStyle = {
    background: "#d8d8d8ff",
    color: "black",
    padding: "0.4vh 0.4vw",
    fontSize: "12px",
  };

  const contentRectStyle = {
    flex: 1,
    background: "#ffffff",
    marginBottom: "4px",
    border: "1px solid #e0e0e0",
    boxShadow: "0 0 4px rgba(0,0,0,0.15)",
  };

  return (
    <div
      ref={appRef}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#f9f9f9",
        fontFamily: '"Verdana", sans-serif',
      }}
    >
      {/* Header (with whole-app capture button) */}
      <div
        ref={headerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: `${headerHeight}%`,
          background: "#5e5e5eff",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "5vw",
          // Make it a containing block for the invisible button:
          position: "absolute",
        }}
      >
        <div style={{ position: "relative", paddingLeft: "5vw" }}>
          <div style={{ fontWeight: 800, fontSize: 30 }}>DFCollection</div>
          {/* Invisible header-level shot (captures entire interface) */}
          <ShotButton
            title="Save Full Interface PNG"
            onClick={captureWholeApp}
          />
        </div>
        <UploadAndSelect width="100%" apiBase={API_BASE} />
      </div>

      {/* Collection-Summary View */}
      <div
        style={{
          ...sectionStyle,
          position: "absolute",
          top: `${headerHeight}%`,
          left: "0%",
          width: `${summaryWidth}%`,
          height: `${summaryHeight}%`,
          background: "#ffffffff",
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={titleStyle}>Collection-Summary View</div>
          <ShotButton
            onClick={() => captureSection(summaryRef, "Collection-Summary")}
          />
        </div>
        <div style={contentRectStyle} ref={summaryRef}>
          <CollectionSummary
            insights={insights}
            collections={collections}
            width={summarySize.width}
            height={summarySize.height}
            onFilterSelected={handleFilterSelected}
          />
        </div>
      </div>

      {/* Collection-Fact View */}
      <div
        style={{
          ...sectionStyle,
          position: "absolute",
          top: `${headerHeight}%`,
          left: `${summaryWidth}%`,
          width: `${polygonWidth}%`,
          height: `${polygonHeight}%`,
          background: "#ffffffff",
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={titleStyle}>Collection-Fact View</div>
          <ShotButton
            onClick={() => captureSection(polygonRef, "Insight-Polygon")}
          />
        </div>
        <div style={contentRectStyle} ref={polygonRef}>
          {!selectedCollection ? (
            <div style={{ padding: 32 }}>
              Select a collection to explore details.
            </div>
          ) : (
            <InsightPolygon
              width={polygonSize.width}
              height={polygonSize.height}
              collection={selectedCollection}
              filterOrder={filterOrder}
              setFilterOrder={setFilterOrder}
              sectionData={sectionData}
              onInsightClick={setClickedInsight}
              selectedInsight={clickedInsight}
            />
          )}
        </div>
      </div>

      {/* Fact-Summary View */}
      <div
        style={{
          ...sectionStyle,
          position: "absolute",
          top: `${headerHeight}%`,
          left: `${insightSummaryLeft}%`,
          width: `${insightSummaryWidth}%`,
          height: `${summaryHeight}%`,
          background: "rgba(255, 255, 255, 1)",
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={titleStyle}>Fact Summary View</div>
          <ShotButton
            onClick={() => captureSection(insightSummaryRef, "Insight-Summary")}
          />
        </div>
        <div style={contentRectStyle} ref={insightSummaryRef}>
          <InsightSummary
            width={insightSummarySize.width}
            height={insightSummarySize.height}
            selectedCollection={selectedCollection}
          />
        </div>
      </div>

      {/* Collection View */}
      <div
        style={{
          ...sectionStyle,
          position: "absolute",
          top: `${collectionVoronoiTop}%`,
          left: "0%",
          width: `${summaryWidth}%`,
          height: `${collectionVoronoiHeight}%`,
          background: "#ffffffff",
          color: "white",
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={titleStyle}>Collection-Fact View</div>
          <ShotButton
            onClick={() => captureSection(voronoiRef, "Collection-Voronoi")}
          />
        </div>
        <div style={contentRectStyle} ref={voronoiRef}>
          <CollectionVoronoi
            width={voronoiSize.width}
            height={voronoiSize.height}
            data={collections}
            setSelectedCollection={setSelectedCollection}
            setFilterOrder={setFilterOrder}
            selectedFilter={selectedOverviewFilter}
            selectedCollection={selectedCollection}
            history={history}
            valueSequences={valueSequence}
          />
        </div>
      </div>

      {/* Fact View */}
      <div
        style={{
          ...sectionStyle,
          position: "absolute",
          top: `${insightSimilarityTop}%`,
          left: `${insightSummaryLeft}%`,
          width: `${insightSummaryWidth}%`,
          height: `${insightSimilarityHeight}%`,
          background: "#ffffffff",
          color: "white",
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={titleStyle}>Fact View</div>
          <ShotButton
            onClick={() => captureSection(similarityRef, "Insight-Similarity")}
          />
        </div>
        <div style={contentRectStyle} ref={similarityRef}>
          <InsightSimilarity
            width={similaritySize.width}
            height={similaritySize.height}
            collection={selectedCollection}
            onInsightClick={setClickedInsight}
            selectedInsight={clickedInsight}
          />
        </div>
      </div>

      {/* History View */}
      <div
        style={{
          ...sectionStyle,
          position: "absolute",
          top: `${historyTop}%`,
          left: `${summaryWidth}%`,
          width: `${polygonWidth + insightSummaryWidth}%`,
          height: `${historyHeight}%`,
          background: "#ffffffff",
          color: "white",
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={titleStyle}>History View</div>
          <ShotButton
            onClick={() => captureSection(historyRef, "History-View")}
          />
        </div>
        <div style={contentRectStyle} ref={historyRef}>
          <HistoryView
            width={historySize.width}
            height={historySize.height}
            currentInsight={clickedInsight}
            currentCollection={selectedCollection}
            history={history}
            onShot={handleShot}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
