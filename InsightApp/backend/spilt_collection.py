import config

def split_collection_by_filters(collection, filter_sequence):
    insights = collection["insights"]
    total_collection_score = sum(ins["score"] for ins in insights)

    # Fetch value domains (some may be grouped into "First/Second/Third group")
    value_domains = get_value_sequences()

    # If no filters specified, return a single root node with all insights
    if not filter_sequence:
        return [{
            "filter_set": {},
            "insights": insights,
            "total_score": total_collection_score,
            "normalized_ratio": 1.0,
            "children": []
        }]

    # Recursive function to split insights layer by layer based on filter sequence
    def recurse(insights, filters, current_filter_set, parent_score):
        if not filters:
            # Base case: no more filters left
            score = sum(ins["score"] for ins in insights)
            return [{
                "filter_set": current_filter_set,
                "insights": insights,
                "total_score": score,
                "normalized_ratio": score / parent_score if parent_score else 0,
                "children": []
            }]

        filter_name = filters[0]
        domain = value_domains.get(filter_name, [])

        # Determine if values are grouped (e.g., [{"group": "First group", "values": [...]}, ...])
        is_grouped = domain and isinstance(domain[0], dict) and "group" in domain[0]

        # Initialize group labels and a map from label → value set
        group_labels = []
        group_value_map = {}

        if is_grouped:
            for group in domain:
                label = group["group"]
                values = group["values"]
                group_labels.append(label)
                group_value_map[label] = set(values)
        else:
            # Flat value list (e.g., ["Male", "Female"])
            group_labels = domain
            group_value_map = {val: {val} for val in domain}

        # For enforcing minimum ratio
        num_values = len(group_labels)
        min_ratio = min(0.1, 1.0 / num_values) if num_values > 0 else 0

        # Compute raw scores per group
        raw_scores = []
        for label in group_labels:
            group_values = group_value_map[label]
            sub_insights = [ins for ins in insights if ins['subspace'].get(filter_name) in group_values]
            score = sum(ins["score"] for ins in sub_insights)
            raw_scores.append(score)

        total_score = sum(raw_scores)
        total_score = total_score if total_score > 0 else 1e-8  # Prevent divide-by-zero

        # Apply enforced minimum ratio
        enforced_ratios = [max(score / total_score, min_ratio) for score in raw_scores]

        # Normalize ratios to sum to 1
        total_enforced = sum(enforced_ratios)
        normalized_ratios = [r / total_enforced for r in enforced_ratios]

        results = []

        # Construct result segments
        for idx, label in enumerate(group_labels):
            group_values = group_value_map[label]
            sub_insights = [ins for ins in insights if ins['subspace'].get(filter_name) in group_values]
            score = raw_scores[idx]
            ratio = normalized_ratios[idx]

            # Add current group to the filter_set
            child_filter_set = {**current_filter_set, filter_name: label}

            # Recurse if more filters remain
            children = []
            if score > 0 and len(filters) > 1:
                children = recurse(sub_insights, filters[1:], child_filter_set, score)

            results.append({
                "filter_set": child_filter_set,
                "insights": sub_insights,
                "total_score": score,
                "normalized_ratio": ratio,
                "children": children
            })

        return results

    # Begin recursive filtering
    return recurse(insights, filter_sequence, {}, total_collection_score)

def get_value_sequences():
    categorical_columns = config.CATEGORICAL_COLUMNS
    df = config.DATAFRAME

    value_sequences = {}
    for col in categorical_columns:
        values = sorted(df[col].dropna().unique().tolist())

        if len(values) > 10:
            # Split into 3 nearly equal groups
            num_values = len(values)
            group_size = (num_values + 2) // 3

            grouped = [
                {"group": "First group", "values": values[:group_size]},
                {"group": "Second group", "values": values[group_size:2 * group_size]},
                {"group": "Third group", "values": values[2 * group_size:]}
            ]

            # Only keep groups with non-empty values
            value_sequences[col] = [g for g in grouped if g["values"]]
        else:
            value_sequences[col] = values

    return value_sequences