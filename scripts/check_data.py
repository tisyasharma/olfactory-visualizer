from pathlib import Path
from sqlalchemy import text

from code.database.connect import get_engine


def scan_image_folder(base_path: Path, folder_name: str):
    target = base_path / folder_name
    if not target.exists():
        print(f"[WARN] Folder not found: {target}")
        return
    files = sorted([f for f in target.iterdir() if f.is_file() and f.suffix.lower() in {'.png', '.tif', '.tiff', '.jpg', '.jpeg'}])
    print(f"\n--- Files in {folder_name} ---")
    print(f"Total count: {len(files)}")
    if files:
        print("First 3 files:", [p.name for p in files[:3]])
        print("Last 3 files: ", [p.name for p in files[-3:]])


def verify_data():
    engine = get_engine()
    
    print("\n--- 📊 DATABASE STATUS REPORT ---")
    
    with engine.connect() as conn:
        # 1. Count Mice
        mice_count = conn.execute(text("SELECT count(*) FROM subjects")).scalar()
        print(f"🐭 Mice Registered:    {mice_count}")
        
        # 2. Count Brain Regions
        region_count = conn.execute(text("SELECT count(*) FROM brain_regions")).scalar()
        print(f"🧠 Regions Learned:    {region_count}")
        
        # 3. Count Data Points (The big one)
        data_count = conn.execute(text("SELECT count(*) FROM region_counts")).scalar()
        print(f"📈 Data Rows Loaded:   {data_count}")
        
        # 4. Sample Data
        if data_count > 0:
            print("\n--- Sample Data (Top 3 Rows) ---")
            result = conn.execute(text("""
                SELECT s.subject_id, b.name, r.region_pixels, r.hemisphere 
                FROM region_counts r
                JOIN subjects s ON r.subject_id = s.subject_id
                JOIN brain_regions b ON r.region_id = b.region_id
                LIMIT 3
            """))
            for row in result:
                print(f"  - Mouse {row[0]} | Region: {row[1][:20]}... | Pixels: {row[2]} | Side: {row[3]}")


def main():
    verify_data()
    base_path = Path("data/sourcedata/Images")
    if base_path.exists():
        print("\n--- 🗂️ Image Folder Sanity ---")
        for folder in ["DBL_A", "RabiesA_Vglut1"]:
            scan_image_folder(base_path, folder)


if __name__ == "__main__":
    main()
