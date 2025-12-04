"""
Atlas loader.
Reason: isolated Allen atlas JSON flattening into brain_regions.
"""
import json
import pandas as pd
from sqlalchemy import text, types as satypes
from .paths import ATLAS_JSON


def flatten_atlas(node, parent_id=None):
    rows = []
    rid = int(node["id"])
    rows.append(
        {
            "region_id": rid,
            "name": node["name"],
            "acronym": node["acronym"],
            "parent_id": parent_id,
            "st_level": node.get("st_level"),
            "atlas_id": node.get("atlas_id"),
            "ontology_id": node.get("ontology_id"),
        }
    )
    for child in node.get("children", []) or []:
        rows.extend(flatten_atlas(child, parent_id=rid))
    return rows


def load_atlas(engine):
    if not ATLAS_JSON.exists():
        raise FileNotFoundError(f"Atlas JSON not found at {ATLAS_JSON}")
    atlas_data = json.loads(ATLAS_JSON.read_text())
    root_node = atlas_data["msg"][0]
    atlas_rows = flatten_atlas(root_node)
    atlas_df = pd.DataFrame(atlas_rows).drop_duplicates(subset=["region_id"])
    with engine.begin() as conn:
        brain_stage = "_brain_regions_stage"
        atlas_df.to_sql(
            brain_stage,
            con=conn,
            if_exists="replace",
            index=False,
            method="multi",
            dtype={
                "region_id": satypes.Integer(),
                "name": satypes.String(255),
                "acronym": satypes.String(50),
                "parent_id": satypes.Integer(),
                "st_level": satypes.Integer(),
                "atlas_id": satypes.Integer(),
                "ontology_id": satypes.Integer(),
            },
        )
        conn.execute(
            text(
                f"""
                INSERT INTO brain_regions (region_id, name, acronym, parent_id, st_level, atlas_id, ontology_id)
                SELECT region_id, name, acronym, parent_id, st_level, atlas_id, ontology_id
                FROM {brain_stage}
                ON CONFLICT (region_id) DO NOTHING;
                """
            )
        )
        conn.execute(text(f"DROP TABLE IF EXISTS {brain_stage};"))
        conn.execute(
            text("""
                INSERT INTO units (name, description) VALUES
                ('pixels','Raw pixel counts'),
                ('mm2','Square millimeters'),
                ('count','Object count')
                ON CONFLICT (name) DO NOTHING;
            """)
        )

