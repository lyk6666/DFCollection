import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from "react";
import { toPng } from 'html-to-image';

import CollectionVoronoi from "./components/Collection_Voronoi";
import CollectionSummary from "./components/Collection_Summary";
import InsightPolygon from "./components/Insight_Polygon";
import InsightSimilarity from "./components/Insight_Similarity";
import HistoryView from "./components/History_View";
import InsightSummary from "./components/Insight_Summary";
import UploadAndSelect from "./components/UploadAndSelect";

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
  const [collections, setCollections] = useState([]);
  const [valueSequence, setValueSequence] = useState({});
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [filterOrder, setFilterOrder] = useState([]);
  const [sectionData, setSectionData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [selectedOverviewFilter, setSelectedOverviewFilter] = useState([]);
  const [clickedInsight, setClickedInsight] = useState(null);
    // 🔥 NEW: keep history in App (most-recent first)
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem("dfc_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const handleFilterSelected = (filterInfo) => {
    console.log("Selected filter from Overview:", filterInfo);
    setSelectedOverviewFilter(filterInfo);  // <-- optional: store it for FullView
  };

  // at top of App()
  const API_BASE = "http://127.0.0.1:5000";
  const [backendStage, setBackendStage] = useState("idle"); // idle | processing | ready | error
  const [backendMsg, setBackendMsg] = useState("");

  // poll status
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
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setInsights)
      .catch(err => console.error("Error fetching insights:", err));
  }, [backendStage]);

  // collections
  useEffect(() => {
    if (backendStage !== "ready") return;
    fetch(`${API_BASE}/api/insight_collections`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setCollections)
      .catch(err => console.error("Error fetching insight collections:", err));
  }, [backendStage]);

  // value sequence
  useEffect(() => {
    if (backendStage !== "ready") return;
    fetch(`${API_BASE}/api/value_sequence`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setValueSequence)
      .catch(err => console.error("Error fetching value sequence:", err));
  }, [backendStage]);

  useEffect(() => {
    if (backendStage !== "ready") return;
    if (!selectedCollection || filterOrder.length === 0) return;
    fetch(`${API_BASE}/api/collection_sections`, { /* ... */ })
      .then(r => r.json())
      .then(setSectionData);
  }, [backendStage, selectedCollection, filterOrder]);

  // Adjustable values
  const headerHeight = 5;         // %
  const summaryWidth = 30;        // %
  const summaryHeight = 30;       // %
  const polygonWidth = 40;        // %
  const polygonHeight =68;       // %
  const paddingX = 0.25;      // vw
  const paddingY = 0.5;      // vh

  const summaryRef = useRef(null);
  const polygonRef = useRef(null);
  const insightSummaryRef = useRef(null);
  const voronoiRef = useRef(null);
  const similarityRef = useRef(null);
  const historyRef = useRef(null);


// make Shot async so we can await the capture
const handleShot = async () => {
  if (!clickedInsight || !selectedCollection || !polygonRef.current) return;

  // grab the SVG node inside the polygon container
  const node = polygonRef.current.querySelector('svg') || polygonRef.current;

  // make a crisp thumbnail
  const thumb = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: '#fff',
    // optional: set export size (or let it auto-size)
    // width: 600, height: 400,
  });

  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    collection: selectedCollection,
    insight: clickedInsight,
    thumb, // ← store the PNG data URL
  };

  // console.log("Saving screenshot to history:", thumb);

  setHistory(prev => [snapshot, ...prev].slice(0, 3));
};


  const summarySize = useElementSize(summaryRef);
  const polygonSize = useElementSize(polygonRef);
  const insightSummarySize = useElementSize(insightSummaryRef);
  const voronoiSize = useElementSize(voronoiRef);
  const similaritySize = useElementSize(similarityRef);
  const historySize = useElementSize(historyRef);

  // Computed values
  const insightSummaryWidth = 100 - summaryWidth - polygonWidth;
  const collectionVoronoiHeight = 100 - headerHeight - summaryHeight;
  const historyHeight = 100 - headerHeight - polygonHeight;
  const insightSimilarityHeight = 100 - summaryHeight - historyHeight - headerHeight;

  const insightSummaryLeft = summaryWidth + polygonWidth;
  const insightSimilarityTop = headerHeight + summaryHeight;
  const historyTop = 100 - historyHeight;
  const collectionVoronoiTop = headerHeight + summaryHeight;

  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingTop: `${paddingY}vh`,
    paddingLeft: `${paddingX}vw`,
    paddingRight: `${paddingX}vw`,
    boxSizing: 'border-box',
    position: 'absolute',
    overflow: 'hidden'
  };

  const titleStyle = {
    background: '#ccccccff',
    color: 'black',
    padding: '0.5vh 0.5vw',
    fontSize: '10px',
  };

  const contentRectStyle = {
    flex: 1,
    background: '#ffffff',
    marginBottom: '4px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 0 4px rgba(0,0,0,0.15)'
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#f9f9f9', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: `${headerHeight}%`,
        background: '#5e5e5eff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '5vw' // horizontal padding
      }}>
        <div style={{ fontWeight: 800, paddingLeft: '5vw', fontSize: 30 }}>DFCollection</div>
        <UploadAndSelect apiBase="http://127.0.0.1:5000" />
      </div>

      {/* Collection-Summary View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${headerHeight}%`, left: '0%',
        width: `${summaryWidth}%`, height: `${summaryHeight}%`,
        background: '#ffffffff'
      }}>
        <div style={titleStyle}>Collection-Summary View</div>
        <div style={contentRectStyle} ref={summaryRef}>
          <CollectionSummary
            insights={insights}
            collections={collections}
            width={summarySize.width}
            height={summarySize.height} // 30px for header
            onFilterSelected={handleFilterSelected}
          />
        </div>
      </div>

      {/* Insight-Polygon View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${headerHeight}%`, left: `${summaryWidth}%`,
        width: `${polygonWidth}%`, height: `${polygonHeight}%`,
        background: '#ffffffff'
      }}>
        <div style={titleStyle}>Insight-Polygon View</div>
        <div style={contentRectStyle} ref={polygonRef}>
          {!selectedCollection ? (
            <div style={{ padding: 32 }}>Select a collection to explore details.</div>
          ) : (
            <InsightPolygon
              width={polygonSize.width}
              height={polygonSize.height}
              collection={selectedCollection}
              filterOrder={filterOrder}
              setFilterOrder={setFilterOrder}
              sectionData={sectionData}
              onInsightClick={setClickedInsight}
              onLayoutReady={() => {}}
              selectedInsight={clickedInsight}
            />
          )}
        </div>
      </div>

      {/* Insight-Summary View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${headerHeight}%`, left: `${insightSummaryLeft}%`,
        width: `${insightSummaryWidth}%`, height: `${summaryHeight}%`,
        background: 'rgba(255, 255, 255, 1)'
      }}>
        <div style={titleStyle}>Insight-Summary View</div>
        <div style={contentRectStyle} ref={insightSummaryRef}>
          <InsightSummary 
            width={insightSummarySize.width}
            height={insightSummarySize.height}
            selectedCollection={selectedCollection}
          />
        </div>
      </div>

      {/* Collection-Voronoi View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${collectionVoronoiTop}%`, left: '0%',
        width: `${summaryWidth}%`, height: `${collectionVoronoiHeight}%`,
        background: '#ffffffff', color: 'white'
      }}>
        <div style={titleStyle}>Collection-Voronoi View</div>
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
          />
        </div>
      </div>

      {/* Insight-Similarity View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${insightSimilarityTop}%`, left: `${insightSummaryLeft}%`,
        width: `${insightSummaryWidth}%`, height: `${insightSimilarityHeight}%`,
        background: '#ffffffff', color: 'white'
      }}>
        <div style={titleStyle}>Insight-Similarity View</div>
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
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${historyTop}%`, left: `${summaryWidth}%`,
        width: `${polygonWidth + insightSummaryWidth}%`, height: `${historyHeight}%`,
        background: '#ffffffff', color: 'white'
      }}>
        <div style={titleStyle}>History View</div>
        <div style={contentRectStyle} ref={historyRef}>
          <HistoryView
            width={historySize.width}
            height={historySize.height}
            currentInsight={clickedInsight}
            currentCollection={selectedCollection} // collection for current insight
            history={history}                  // ← pass the stored history
            onShot={handleShot}                // ← “screenshot” button handler
          />
        </div>
      </div>
    </div>
  );
}

export default App;
