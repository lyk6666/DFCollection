import React, { useEffect, useState } from "react";
import FullView from "./components/Fullview";
import Explore from "./components/Explore";
import Overview from "./components/Overview";

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
  const overviewWidth = window.innerWidth * 0.35;
  const exploreWidth = window.innerWidth * 0.65;
  const fullViewWidth = overviewWidth;
  const height = window.innerHeight;

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
  const headerHeight = 5;         // %
  const summaryWidth = 30;        // %
  const summaryHeight = 30;       // %
  const polygonWidth = 40;        // %
  const polygonHeight = 65;       // %

  // Computed values
  const insightSummaryWidth = 100 - summaryWidth - polygonWidth;
  const collectionVoronoiHeight = 100 - headerHeight - summaryHeight;
  const historyHeight = 100 - headerHeight - polygonHeight;
  const insightSimilarityHeight = 100 - summaryHeight - historyHeight;

  const insightSummaryLeft = summaryWidth + polygonWidth;
  const insightSimilarityTop = headerHeight + summaryHeight;
  const historyTop = 100 - historyHeight;
  const collectionVoronoiTop = headerHeight + summaryHeight;

  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingTop: '4px',
    paddingLeft: '4px',
    paddingRight: '4px',
    boxSizing: 'border-box',
    position: 'absolute',
    overflow: 'hidden'
  };

  const titleStyle = {
    background: '#00bcd4',
    color: 'white',
    padding: '2px 6px',
    fontSize: '6px',
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
        background: '#dcdcdc'
      }}>
        <div style={titleStyle}>Collection-Summary View</div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Insight-Polygon View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${headerHeight}%`, left: `${summaryWidth}%`,
        width: `${polygonWidth}%`, height: `${polygonHeight}%`,
        background: '#8bc34a'
      }}>
        <div style={titleStyle}>Insight-Polygon View</div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Insight-Summary View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${headerHeight}%`, left: `${insightSummaryLeft}%`,
        width: `${insightSummaryWidth}%`, height: `${summaryHeight}%`,
        background: '#dcdcdc'
      }}>
        <div style={titleStyle}>Insight-Summary View</div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Collection-Voronoi View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${collectionVoronoiTop}%`, left: '0%',
        width: `${summaryWidth}%`, height: `${collectionVoronoiHeight}%`,
        background: '#009688', color: 'white'
      }}>
        <div style={titleStyle}>Collection-Voronoi View</div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Insight-Similarity View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${insightSimilarityTop}%`, left: `${insightSummaryLeft}%`,
        width: `${insightSummaryWidth}%`, height: `${insightSimilarityHeight}%`,
        background: '#757575', color: 'white'
      }}>
        <div style={titleStyle}>Insight-Similarity View</div>
        <div style={{ flex: 1 }} />
      </div>

      {/* History View */}
      <div style={{
        ...sectionStyle,
        position: 'absolute',
        top: `${historyTop}%`, left: `${summaryWidth}%`,
        width: `${polygonWidth + insightSummaryWidth}%`, height: `${historyHeight}%`,
        background: '#9e9e9e', color: 'white'
      }}>
        <div style={titleStyle}>History View</div>
        <div style={{ flex: 1 }} />
      </div>
    </div>
  );
}

export default App;
