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
    polygon, section_data, filter_sequence, filter_colors,
    base_id="root", level=0, base_polygon=None
):
    if base_polygon is None:
        base_polygon = polygon  # set on first call

    if not filter_sequence or not section_data:
        return [], []

    baseline_idx = level
    color = filter_colors[level % len(filter_colors)]

    segments = []
    split_lines = []
    current_poly = Polygon(polygon)
    remaining_ratio = 1.0

    for idx, section in enumerate(section_data):
        raw_ratio = section["normalized_ratio"]
        ratio = raw_ratio/remaining_ratio

        insights = section.get("insights", [])  # ✅ Safely get insights

        if idx < len(section_data) - 1:
            this_seg, current_poly, cut_line = split_polygon_by_area_ratio(
                list(current_poly.exterior.coords),
                baseline_idx,
                ratio,
                f"{base_id}_{idx}",
                base_polygon
            )
            remaining_ratio -= raw_ratio  # 🔄 update remaining
        else:
            this_seg = current_poly
            cut_line = None

        segment = {
            "vertices": list(this_seg.exterior.coords),
            "baseline_idx": baseline_idx,
            "id": f"{base_id}_{idx}",
            "parent_id": base_id,
            "area": this_seg.area,
            "ratio": ratio,
            "children": [],
            "insights": insights,  # ✅ Add insights to the segment
        }

        if cut_line:
            split_lines.append({
                "coordinates": list(cut_line.coords),
                "color": color,
                "level": level,
                "index_in_level": idx  # ✅ Added line
            })

        children_data = section.get("children", [])
        if children_data:
            child_segments, child_lines = recursive_polygon_split(
                segment["vertices"],
                children_data,
                filter_sequence[1:],
                filter_colors,
                base_id=segment["id"],
                level=level + 1,
                base_polygon=base_polygon
            )
            segment["children"] = child_segments
            split_lines.extend(child_lines)

        segments.append(segment)

    return segments, split_lines