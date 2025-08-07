import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from "react";
import CollectionVoronoi from "./components/Collection_Voronoi";
import CollectionSummary from "./components/Collection_Summary";
import InsightPolygon from "./components/Insight_Polygon";
import InsightSimilarity from "./components/Insight_Similarity";

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

  const handleFilterSelected = (filterInfo) => {
    console.log("Selected filter from Overview:", filterInfo);
    setSelectedOverviewFilter(filterInfo);  // <-- optional: store it for FullView
  };

  // Fetch insights
  useEffect(() => {
    fetch("http://localhost:5000/api/insights")
      .then(res => res.json())
      .then(setInsights)
      .catch(err => console.error("Error fetching insights:", err));
  }, []);

  // Fetch collections
  useEffect(() => {
    fetch("http://localhost:5000/api/insight_collections")
      .then(res => res.json())
      .then(setCollections)
      .catch(err => console.error("Error fetching insight collections:", err));
  }, []);

  // Fetch value sequence
  useEffect(() => {
    fetch("http://localhost:5000/api/value_sequence")
      .then(res => res.json())
      .then(setValueSequence)
      .catch(err => console.error("Error fetching value sequence:", err));
  }, []);

  // Fetch section data on collection/filters change
  useEffect(() => {
    if (!selectedCollection || filterOrder.length === 0) return;
    fetch("http://localhost:5000/api/collection_sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection_id: selectedCollection.id,
        filter_sequence: filterOrder
      })
    })
      .then(res => res.json())
      .then(data => {
        setSectionData(data);
        console.log("Sections data from backend:", data);
      })
      .catch(err => console.error("Error fetching section data:", err));
  }, [selectedCollection, filterOrder]);

  // Fixed layout sizes
  // const overviewWidth = window.innerWidth * 0.35;
  // const exploreWidth = window.innerWidth * 0.65;
  // const fullViewWidth = overviewWidth;
  // const height = window.innerHeight;

  // return (
  //   <div style={{ width: "100vw", height: "100vh", display: "flex", overflow: "hidden" }}>
  //     {/* Left side: Overview + FullView vertically stacked */}
  //     <div style={{ width: fullViewWidth, flexDirection: "column" }}>
  //       {/* Overview (Top) */}
  //       <div style={{ height: "25%", background: "#ffffff" }}>
  //         <Overview
  //           insights={insights}
  //           collections={collections}
  //           width={fullViewWidth}
  //           height={height * 0.25}
  //           onFilterSelected={handleFilterSelected}
  //         />
  //       </div>

  //       {/* FullView (Bottom) */}
  //       <div style={{ height: "75%", background: "#ffffff" }}>
  //         {collections.length > 0 && (
  //           <FullView
  //             width={fullViewWidth}
  //             height={height * 0.75}
  //             data={collections}
  //             setSelectedCollection={setSelectedCollection}
  //             setFilterOrder={setFilterOrder}
  //             selectedFilter={selectedOverviewFilter}
  //             selectedCollection={selectedCollection}
  //           />
  //         )}
  //       </div>
  //     </div>

  //    {/* Explore stays on the right */}
  //      <div style={{ width: exploreWidth, background: "#ffffff" }}>
  //        <Explore
  //         collection={selectedCollection}
  //         filterOrder={filterOrder}
  //         setFilterOrder={setFilterOrder}
  //         sectionData={sectionData}
  //         width={exploreWidth}
  //         height={height}
  //       />
  //     </div>
  //   </div>
  // );


  // Adjustable values
  const headerHeight = 3;         // %
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
        background: '#00bcd4', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        DFCollection
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
              onInsightClick={() => {}}
              onLayoutReady={() => {}}
              selectedInsight={null}
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
            onInsightClick={() => {}}
            onLayoutReady={() => {}}
            onLegendReady={() => {}}
            onTypeLegendReady={() => {}}
            onLargestReady={() => {}}
            polygonLayout={[]} // Pass empty array for now
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
        <div style={contentRectStyle} ref={historyRef}></div>
      </div>
    </div>
  );
}

export default App;
