import React, { useMemo, useState } from "react";

/** ====== CONFIG ====== */
// Change this to match your backend's IP/port
const DEFAULT_API_BASE = "http://127.0.0.1:5000";

/** ====== API HELPERS (local to this file) ====== */
async function uploadCsv(file, API_BASE) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/upload-csv`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Upload failed");
  return data;
}

async function sendSelections(payload, API_BASE) {
  const res = await fetch(`${API_BASE}/set-columns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Submit failed");
  return data;
}

/** ====== dtype helpers ====== */
function isNumericDtype(dtypeStr) {
  const s = String(dtypeStr || "").toLowerCase().trim();
  if (s.includes("bool")) return false;
  return (
    s.includes("int") ||
    s.includes("float") ||
    s.includes("double") ||
    s.startsWith("number")
  );
}

/** ====== SIMPLE DROPDOWN CHECKLIST ====== */
function DropdownChecklist({ label, options = [], selected = [], onChange = () => {} }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.note && String(o.note).toLowerCase().includes(q))
    );
  }, [options, query]);

  const toggleItem = (val) => {
    onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]);
  };

  const caret = open ? "▲" : "▼";

  return (
    <div style={{ position: "relative", display: "inline-block", minWidth: 200, zIndex: 1000 }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          width: "100%",
          padding: "1px 10px",
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <span>
          {label} {selected.length ? `(${selected.length})` : ""}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 8 }}>{caret}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            width: "100%",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "none",
              borderBottom: "1px solid #eee",
              boxSizing: "border-box",
            }}
          />
          {filtered.map(({ value, note }) => (
            <label
              key={value}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 8px",
                cursor: "pointer",
                gap: 8,
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => toggleItem(value)}
              />
              <span style={{ flex: 1, color: "#111", fontSize: 12 }}>{value}</span>
              {note && <em style={{ color: "#777", fontSize: 10 }}>({note})</em>}
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 8, color: "#777" }}>No results</div>
          )}
        </div>
      )}
    </div>
  );
}

/** ====== MEASURE DROPDOWN WITH AGGREGATION PICKER ====== */
const AGG_OPTIONS = ["SUM", "MAX", "MIN", "AVG", "COUNT"];

function MeasureDropdown({
  label = "Measure Columns",
  options = [],
  selected = [],
  onSelectedChange = () => {},
  measureAggs = {},
  onAggChange = () => {},
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.note && String(o.note).toLowerCase().includes(q))
    );
  }, [options, query]);

  const caret = open ? "▲" : "▼";

  const toggleItem = (val) => {
    if (selected.includes(val)) {
      // remove selection and its agg
      const nextSel = selected.filter((x) => x !== val);
      onSelectedChange(nextSel);
      const nextAggs = { ...measureAggs };
      delete nextAggs[val];
      onAggChange(nextAggs);
    } else {
      // add selection and default agg SUM
      const nextSel = [...selected, val];
      onSelectedChange(nextSel);
      onAggChange({ ...measureAggs, [val]: measureAggs[val] || "SUM" });
    }
  };

  const handleAggChange = (col, agg) => {
    onAggChange({ ...measureAggs, [col]: agg });
  };

  return (
    <div style={{ position: "relative", display: "inline-block", minWidth: 260, zIndex: 1000 }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          width: "100%",
          padding: "1px 10px",
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <span>
          {label} {selected.length ? `(${selected.length})` : ""}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 8 }}>{caret}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            width: "100%",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            maxHeight: 280,
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "none",
              borderBottom: "1px solid #eee",
              boxSizing: "border-box",
            }}
          />

          {filtered.map(({ value, note }) => {
            const checked = selected.includes(value);
            const chosenAgg = measureAggs[value] || "SUM";
            return (
              <div
                key={value}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(value)}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "#111", fontSize: 12 }}>{value}</span>
                  {note && <em style={{ color: "#777", fontSize: 10 }}>({note})</em>}
                </div>

                {/* Aggregation picker (enabled when checked) */}
                <select
                  value={chosenAgg}
                  disabled={!checked}
                  onChange={(e) => handleAggChange(value, e.target.value)}
                  style={{
                    padding: "2px 6px",
                    fontSize: 12,
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    background: checked ? "#fff" : "#f5f5f5",
                  }}
                >
                  {AGG_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: 8, color: "#777" }}>No results</div>
          )}
        </div>
      )}
    </div>
  );
}

/** ====== MAIN COMBINED COMPONENT ====== */
export default function UploadAndSelect({ apiBase = DEFAULT_API_BASE }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  const [columns, setColumns] = useState([]);
  const [dtypes, setDtypes] = useState({});
  const [rows, setRows] = useState(0);

  const [categorical, setCategorical] = useState([]);
  const [ordinal, setOrdinal] = useState([]);
  const [numerical, setNumerical] = useState([]);         // selected measure columns
  const [measureAggs, setMeasureAggs] = useState({});     // { colName: "SUM" | "MAX" | ... }

  const options = useMemo(
    () => columns.map((c) => ({ value: c, note: dtypes[c] || "" })),
    [columns, dtypes]
  );

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setStatus("Uploading…");
    try {
      const data = await uploadCsv(file, apiBase);
      console.log("Upload response:", data);

      const newColumns = data.columns || [];
      const newDtypes = data.dtypes || {};
      const newRows = data.rows || 0;

      setColumns(newColumns);
      setDtypes(newDtypes);
      setRows(newRows);

      // === DEFAULT SELECTIONS ===
      const defaultCategorical = newColumns.filter((c) => !isNumericDtype(newDtypes[c]));
      const defaultOrdinal = [];
      const defaultNumerical = newColumns.filter((c) => isNumericDtype(newDtypes[c]));
      const defaultAggs = Object.fromEntries(defaultNumerical.map((c) => [c, "SUM"]));

      setCategorical(defaultCategorical);
      setOrdinal(defaultOrdinal);
      setNumerical(defaultNumerical);
      setMeasureAggs(defaultAggs);

      setStatus(`Uploaded dataset of ${newRows} rows with ${newColumns.length} columns. Defaults applied.`);
    } catch (err) {
      setStatus(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitSelections = async () => {
    setStatus("Submitting selections…");
    try {
      // Send both the list and the [col, agg] pairs
      const measure_aggs = numerical.map((col) => [col, measureAggs[col] || "SUM"]);
      const payload = { categorical, ordinal, numerical, measure_aggs };
      const resp = await sendSelections(payload, apiBase);
      console.log("Selections response:", resp);
      setStatus("Selections sent!");
    } catch (err) {
      setStatus(err.message || "Submit failed");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      {/* Upload */}
      <form onSubmit={handleUpload} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ maxWidth: 180 }}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {/* After upload */}
      {columns.length > 0 && (
        <>
          <DropdownChecklist
            label="Subspace Columns"
            options={options}
            selected={categorical}
            onChange={setCategorical}
          />
          <DropdownChecklist
            label="Ordinal Columns"
            options={options}
            selected={ordinal}
            onChange={setOrdinal}
          />
          <MeasureDropdown
            label="Measure Columns"
            options={options.filter(({ value }) => isNumericDtype(dtypes[value]))}
            selected={numerical}
            onSelectedChange={setNumerical}
            measureAggs={measureAggs}
            onAggChange={setMeasureAggs}
          />
          <button type="button" onClick={handleSubmitSelections}>Submit</button>
        </>
      )}

      <span style={{ flex: 1, marginLeft: 8, fontSize: 10, color: "#fff" }}>{status}</span>
    </div>
  );
}
