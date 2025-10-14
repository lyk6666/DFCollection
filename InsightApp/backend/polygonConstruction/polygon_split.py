from shapely.geometry import Polygon, LineString
from shapely.ops import split
import numpy as np

def split_polygon_by_area_ratio(polygon, baseline_idx, ratio, base_id, base_polygon, max_iter=20, tol=1e-4):
    A = base_polygon[baseline_idx]
    B = base_polygon[(baseline_idx + 1) % len(base_polygon)]

    dx, dy = B[0] - A[0], B[1] - A[1]
    length = (dx ** 2 + dy ** 2) ** 0.5
    current_poly = Polygon(polygon)
    target_area = current_poly.area * ratio

    if length < 1e-8:
        return current_poly, current_poly, None

    dir_vec = np.array([dx / length, dy / length])
    normal_vec = np.array([-dy / length, dx / length])

    # Project all vertices onto normal
    projections = [np.dot(np.array([x, y]) - A, normal_vec) for x, y in polygon]
    min_proj, max_proj = min(projections), max(projections)

    # Binary search over projection distance to match area
    low, high = min_proj, max_proj
    best_left, best_right, best_line = None, None, None

    for _ in range(max_iter):
        mid_proj = (low + high) / 2
        cut_center = np.array(A) + normal_vec * mid_proj
        px, py = cut_center

        cut_line = LineString([
            (px - dir_vec[0] * 1000, py - dir_vec[1] * 1000),
            (px + dir_vec[0] * 1000, py + dir_vec[1] * 1000)
        ])

        try:
            split_polys = split(current_poly, cut_line)
        except Exception:
            break  # can't split

        if len(split_polys.geoms) < 2:
            break

        seg1, seg2 = split_polys.geoms
        area1 = seg1.area
        area2 = seg2.area

        # Determine which is 'left' based on normal direction
        centroid1 = np.array([seg1.centroid.x, seg1.centroid.y])
        centroid2 = np.array([seg2.centroid.x, seg2.centroid.y])
        proj1 = np.dot(centroid1 - np.array(A), normal_vec)
        proj2 = np.dot(centroid2 - np.array(A), normal_vec)

        left_seg, right_seg = (seg1, seg2) if proj1 < proj2 else (seg2, seg1)
        left_area = left_seg.area

        best_left, best_right, best_line = left_seg, right_seg, left_seg.boundary.intersection(right_seg.boundary)

        # Check if area is close enough
        if abs(left_area - target_area) / target_area < tol:
            break

        if left_area < target_area:
            low = mid_proj  # need to increase left area
        else:
            high = mid_proj  # need to decrease left area

    return best_left, best_right, best_line


def recursive_polygon_split(
    polygon,
    section_data,
    filter_sequence=None,
    filter_colors=None,
    base_id="root",
    level=0,
    base_polygon=None,
):
    """
    Recursively splits `polygon` into segments per `section_data` ratios.

    Behavior regarding filters:
      - If `filter_sequence` or `filter_colors` is None, we still compute and return `segments`,
        but we return `split_lines=None`.
      - If both are provided, we also return `split_lines` as a list of dicts
        (with "coordinates", "color", "level", "index_in_level").

    Returns:
        (segments, split_lines)
        - segments: list of segment dicts (always a list, possibly nested via "children")
        - split_lines: list of line dicts if filters are provided; otherwise None
    """
    # Early exits and safe defaults
    if polygon is None or len(polygon) < 3:
        return [], None if (filter_sequence is None or filter_colors is None) else []

    current_poly = Polygon(polygon)
    if not current_poly.is_valid or current_poly.area <= 0:
        return [], None if (filter_sequence is None or filter_colors is None) else []

    if base_polygon is None:
        base_polygon = list(Polygon(polygon).exterior.coords)

    # If there is no section_data, nothing to split; still respect split_lines=None when filters are None
    if not section_data:
        return [], None if (filter_sequence is None or filter_colors is None) else []

    # Determine whether to emit split lines
    emit_split_lines = (filter_sequence is not None) and (filter_colors is not None)
    split_lines = [] if emit_split_lines else None

    # Baseline index (when no filter_sequence, stick with 0 so it’s deterministic)
    baseline_idx = level if emit_split_lines else 0
    color = None
    if emit_split_lines and len(filter_colors) > 0:
        color = filter_colors[level % len(filter_colors)]

    segments = []
    current_poly = Polygon(polygon)
    remaining_ratio = 1.0

    for idx, section in enumerate(section_data):
        raw_ratio = float(section.get("normalized_ratio", 0.0))
        # Avoid division by zero when remaining_ratio briefly hits 0
        ratio = raw_ratio / remaining_ratio if remaining_ratio > 1e-12 else 0.0

        insights = section.get("insights", [])
        has_more = idx < len(section_data) - 1

        if has_more and ratio > 0.0:
            # Attempt to split off this segment
            left_seg, remainder, cut_line = split_polygon_by_area_ratio(
                list(current_poly.exterior.coords),
                baseline_idx,
                ratio,
                f"{base_id}_{idx}",
                base_polygon
            )

            if remainder is None:
                # Could not split further → treat current remainder as the final piece
                this_seg = current_poly
                cut_line = None
                # Append and stop splitting at this level
                segment = {
                    "vertices": list(this_seg.exterior.coords),
                    "baseline_idx": baseline_idx,
                    "id": f"{base_id}_{idx}",
                    "parent_id": base_id,
                    "area": this_seg.area,
                    "ratio": ratio,
                    "children": [],
                    "insights": insights,
                }
                segments.append(segment)
                # No split line when we failed to split
                break
            else:
                this_seg = left_seg
                current_poly = remainder  # keep the remainder to split further
                remaining_ratio -= raw_ratio
        else:
            # Last segment or zero ratio → whatever remains
            this_seg = current_poly
            cut_line = None

        # Record segment
        segment = {
            "vertices": list(this_seg.exterior.coords),
            "baseline_idx": baseline_idx,
            "id": f"{base_id}_{idx}",
            "parent_id": base_id,
            "area": this_seg.area,
            "ratio": ratio,
            "children": [],
            "insights": insights,
        }
        segments.append(segment)

        # Record cut line only when filters exist and we actually cut
        if emit_split_lines and cut_line is not None:
            split_lines.append({
                "coordinates": list(cut_line.coords),
                "color": color,
                "level": level,
                "index_in_level": idx
            })

        # Recurse into children (if any)
        children_data = section.get("children", [])
        if children_data:
            child_segments, child_lines = recursive_polygon_split(
                segment["vertices"],
                children_data,
                # Only pass filters down if we are emitting split lines
                filter_sequence[1:] if (emit_split_lines and filter_sequence) else None,
                filter_colors if emit_split_lines else None,
                base_id=segment["id"],
                level=level + 1,
                base_polygon=base_polygon
            )
            segment["children"] = child_segments
            if emit_split_lines and child_lines:
                split_lines.extend(child_lines)

    return segments, split_lines