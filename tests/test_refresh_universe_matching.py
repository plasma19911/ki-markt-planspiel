from scripts.refresh_universe import build_name_indexes, unique_match


def test_exact_and_unique_legal_suffix_match():
    records = [
        {"isin": "DE0000000001", "name": "Acme Corporation"},
        {"isin": "DE0000000002", "name": "Other Holdings SE"},
    ]
    exact, relaxed = build_name_indexes(records)
    row, mode = unique_match("Acme Corporation", exact, relaxed)
    assert row["isin"] == "DE0000000001"
    assert mode == "EXACT_NORMALIZED_NAME"

    row, mode = unique_match("Acme Corp", exact, relaxed)
    assert row["isin"] == "DE0000000001"
    assert mode == "UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME"


def test_ambiguous_relaxed_name_is_rejected():
    records = [
        {"isin": "DE0000000011", "name": "Example Inc"},
        {"isin": "DE0000000012", "name": "Example Corporation"},
    ]
    exact, relaxed = build_name_indexes(records)
    row, mode = unique_match("Example Ltd", exact, relaxed)
    assert row is None
    assert mode is None


def test_share_class_and_adr_markers_remain_significant():
    records = [
        {"isin": "US0000000021", "name": "ClassCo Ordinary Shares"},
        {"isin": "US0000000022", "name": "ClassCo ADR"},
    ]
    exact, relaxed = build_name_indexes(records)

    row, mode = unique_match("ClassCo Inc", exact, relaxed)
    assert row is None
    assert mode is None

    row, mode = unique_match("ClassCo ADR Inc", exact, relaxed)
    assert row["isin"] == "US0000000022"
    assert mode == "UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME"


if __name__ == "__main__":
    test_exact_and_unique_legal_suffix_match()
    test_ambiguous_relaxed_name_is_rejected()
    test_share_class_and_adr_markers_remain_significant()
    print("Trade Republic universe matching safety tests passed")
