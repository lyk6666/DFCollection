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

  // 👇 caret flips: open → "^", closed → "v"
	const caret = open ? "▲" : "▼";

  return (
    <div style={{ position: "relative", display: "inline-block", minWidth: 220, zIndex: 1000 }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          width: "100%",
          padding: "2px 10px",
          border: "1px solid #ccc",
          borderRadius: 6,
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
      setColumns(data.columns || []);
      setDtypes(data.dtypes || {});
      setRows(data.rows || 0);
      setCategorical([]);
      setOrdinal([]);
      setStatus(`Uploaded ${data.rows} rows.`);
    } catch (err) {
      setStatus(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitSelections = async () => {
    setStatus("Submitting selections…");
    try {
      const resp = await sendSelections({ categorical, ordinal }, apiBase);
      console.log("Selections response:", resp);
      setStatus("Selections sent!");
    } catch (err) {
      setStatus(err.message || "Submit failed");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* Upload */}
      <form onSubmit={handleUpload} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ maxWidth: 200 }}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Uploading…" : "Upload CSV"}
        </button>
      </form>

      {/* After upload */}
      {columns.length > 0 && (
        <>
          <DropdownChecklist
            label="Non-Numeric Columns"
            options={options}
            selected={categorical}
            onChange={(next) => {
              console.log("Categorical ->", next);
              setCategorical(next);
            }}
          />
          <DropdownChecklist
            label="Ordinal Columns"
            options={options}
            selected={ordinal}
            onChange={(next) => {
              console.log("Ordinal ->", next);
              setOrdinal(next);
            }}
          />
          <button type="button" onClick={handleSubmitSelections}>Submit</button>
        </>
      )}

      <span style={{ marginLeft: 8, fontSize: 12, color: "#fff" }}>{status}</span>
      {/* small hint */}
      {columns.length > 0 && (
        <span style={{ fontSize: 12, color: "#e9f8ff" }}>
          {columns.length} cols · {rows} rows
        </span>
      )}
    </div>
  );
}
