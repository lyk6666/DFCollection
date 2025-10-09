import React, { useMemo, useRef, useState } from "react";
import {BACKEND_URL} from "../config";

/** ====== CONFIG ====== */
// Change this to match your backend's IP/port
const API_BASE = BACKEND_URL;

/** ====== SHARED STYLES ====== */
const baseButtonStyle = {
  border: "1px solid #ccc",
  borderRadius: 2,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  color: "#111",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  width: '6vw',
  height: '3vh'
};

const primaryButtonStyle = {
  ...baseButtonStyle,
  background: "#fff",
  borderColor: "#fff",
  color: "#111",
};

const subtleButtonStyle = {
  ...baseButtonStyle,
  background: "#f9fafb",
};

const textInputStyle = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid #ccc",
  borderRadius: 2,
  boxSizing: "border-box",
  fontSize: 12,
  background: "#fff",
  color: "#111",
};

const checkboxStyle = {
  width: 14,
  height: 14,
  cursor: "pointer",
};

const selectStyle = {
  padding: "4px 8px",
  fontSize: 12,
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
  color: "#111",
};

/** ====== API HELPERS (local to this file) ====== */
async function uploadCsv(file, API_BASE) {
  console.log("API_BASE:", API_BASE);
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
          ...baseButtonStyle,
          width: "100%",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          {label} {selected.length ? `(${selected.length})` : ""}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 8 }}>{caret}</span>
      </button>

      {open && (
        <div
          role="listbox"
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
            style={{ ...textInputStyle, borderRadius: "6px 6px 0 0" }}
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
                style={checkboxStyle}
              />
              <span style={{ flex: 1, color: "#111", fontSize: 12 }}>{value}</span>
              {note && <em style={{ color: "#777", fontSize: 10 }}>({note})</em>}
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 8, color: "#777", fontSize: 12 }}>No results</div>
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
      const nextSel = selected.filter((x) => x !== val);
      onSelectedChange(nextSel);
      const nextAggs = { ...measureAggs };
      delete nextAggs[val];
      onAggChange(nextAggs);
    } else {
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
          ...baseButtonStyle,
          width: "100%",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          {label} {selected.length ? `(${selected.length})` : ""}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 8 }}>{caret}</span>
      </button>

      {open && (
        <div
          role="listbox"
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
            style={{ ...textInputStyle, borderRadius: "6px 6px 0 0" }}
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
                  style={checkboxStyle}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "#111", fontSize: 12 }}>{value}</span>
                  {note && <em style={{ color: "#777", fontSize: 10 }}>({note})</em>}
                </div>

                <select
                  value={chosenAgg}
                  disabled={!checked}
                  onChange={(e) => handleAggChange(value, e.target.value)}
                  style={{
                    ...selectStyle,
                    background: checked ? "#fff" : "#f5f5f5",
                    cursor: checked ? "pointer" : "not-allowed",
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
            <div style={{ padding: 8, color: "#777", fontSize: 12 }}>No results</div>
          )}
        </div>
      )}
    </div>
  );
}

/** ====== CUSTOM FILE INPUT (HIDES NATIVE TEXT) ====== */
function CsvFilePicker({ onFile }) {
  const inputRef = useRef(null);

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e) => {
    const f = e.target.files?.[0] || null;
    onFile?.(f);
    // Clear the value so the same file can be re-selected if needed
    e.target.value = "";
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {/* Hidden native file input: NEVER shows filename or 'No file chosen' */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleChange}
        style={{
          // Fully visually hidden but still accessible via button
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />
      <button
        type="button"
        onClick={handlePick}
        style={subtleButtonStyle}
        aria-label="Choose CSV file"
      >
        Choose CSV
      </button>
    </div>
  );
}

/** ====== MAIN COMBINED COMPONENT ====== */
export default function UploadAndSelect({ apiBase = API_BASE }) {
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
      setFile(null); // clear any reference to avoid implicit name display elsewhere
    }
  };

  const handleSubmitSelections = async () => {
    setStatus("Submitting selections…");
    try {
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
        {/* Custom CSV picker (no filename text shown) */}
        <CsvFilePicker onFile={setFile} />

        <button
          type="submit"
          disabled={!file || uploading}
          style={{
            ...primaryButtonStyle,
            opacity: !file || uploading ? 0.6 : 1,
            cursor: !file || uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {/* After upload */}
      {columns.length > 0 && (
        <>
          <DropdownChecklist
            label="Subspace Attributes"
            options={options}
            selected={categorical}
            onChange={setCategorical}
          />
          <DropdownChecklist
            label="Ordinal Attributes"
            options={options}
            selected={ordinal}
            onChange={setOrdinal}
          />
          <MeasureDropdown
            label="Measure Attributes"
            options={options.filter(({ value }) => isNumericDtype(dtypes[value]))}
            selected={numerical}
            onSelectedChange={setNumerical}
            measureAggs={measureAggs}
            onAggChange={setMeasureAggs}
          />
          <button
            type="button"
            onClick={handleSubmitSelections}
            style={primaryButtonStyle}
          >
            Submit
          </button>
        </>
      )}

      <span
        style={{
          flex: 1,
          marginLeft: 8,
          fontSize: 12,
          color: "#444",
          minHeight: 18,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {status}
      </span>
    </div>
  );
}
