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

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", overflow: "hidden" }}>
      {/* Left side: Overview + FullView vertically stacked */}
      <div style={{ width: fullViewWidth, flexDirection: "column" }}>
        {/* Overview (Top) */}
        <div style={{ height: "25%", background: "#e0e0e0" }}>
          <Overview
            insights={insights}
            collections={collections}
            width={fullViewWidth}
            height={height * 0.25}
            onFilterSelected={handleFilterSelected}
          />
        </div>

        {/* FullView (Bottom) */}
        <div style={{ height: "75%", background: "#e0e0e0" }}>
          {collections.length > 0 && (
            <FullView
              width={fullViewWidth}
              height={height * 0.75}
              data={collections}
              setSelectedCollection={setSelectedCollection}
              setFilterOrder={setFilterOrder}
              selectedFilter={selectedOverviewFilter}
              selectedCollection={selectedCollection}
            />
          )}
        </div>
      </div>

      {/* Explore stays on the right */}
      <div style={{ width: exploreWidth, background: "#e0e0e0" }}>
        <Explore
          collection={selectedCollection}
          filterOrder={filterOrder}
          setFilterOrder={setFilterOrder}
          sectionData={sectionData}
          width={exploreWidth}
          height={height}
        />
      </div>
    </div>
  );

}

export default App;
