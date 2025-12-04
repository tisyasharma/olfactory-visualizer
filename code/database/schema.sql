
DROP TABLE IF EXISTS region_counts CASCADE;
DROP TABLE IF EXISTS ingest_log CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS scrna_cluster_markers CASCADE;
DROP TABLE IF EXISTS scrna_clusters CASCADE;
DROP TABLE IF EXISTS scrna_samples CASCADE;
DROP TABLE IF EXISTS microscopy_files CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS brain_regions CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP SCHEMA IF EXISTS rna CASCADE;

CREATE TABLE subjects (
    subject_id VARCHAR(50) PRIMARY KEY, -- e.g., 'sub-dbl01'
    original_id VARCHAR(100) UNIQUE,    -- e.g., 'DBL_A'
    sex CHAR(1) NOT NULL CHECK (sex IN ('M','F','U')),
    experiment_type VARCHAR(50) NOT NULL CHECK (experiment_type IN ('double_injection','rabies')),
    details TEXT
);

-- 2. BRAIN REGIONS (Dictionary)
CREATE TABLE brain_regions (
    region_id INT PRIMARY KEY,          -- Matches Allen Brain Atlas ID
    name VARCHAR(255) NOT NULL,         -- Region name
    acronym VARCHAR(50) NOT NULL,
    parent_id INT REFERENCES brain_regions(region_id),
    st_level INT,
    atlas_id INT,
    ontology_id INT
);

-- 2b. Sessions (for imaging/omics runs)
CREATE TABLE sessions (
    session_id VARCHAR(50) PRIMARY KEY,
    subject_id VARCHAR(50) REFERENCES subjects(subject_id),
    modality VARCHAR(50) NOT NULL, -- e.g., rabies, double_injection, scrna
    session_date DATE,
    protocol TEXT,
    notes TEXT
);

-- 2c. Microscopy files (BIDS-like runs)
CREATE TABLE microscopy_files (
    file_id SERIAL PRIMARY KEY,
    session_id VARCHAR(50) REFERENCES sessions(session_id),
    run INT,
    hemisphere VARCHAR(20) CHECK (hemisphere IN ('left','right','bilateral')),
    path TEXT NOT NULL,
    sha256 CHAR(64),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id, run, hemisphere)
);

-- 4. Units lookup (for FAIR metadata) - defined before region_counts to satisfy FKs
CREATE TABLE units (
    unit_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE, -- e.g., pixels, mm2, count
    description TEXT
);

-- 3. EXPERIMENTAL DATA (The Metrics)
CREATE TABLE region_counts (
    id SERIAL PRIMARY KEY,
    subject_id VARCHAR(50) REFERENCES subjects(subject_id),
    region_id INT REFERENCES brain_regions(region_id),
    file_id INT REFERENCES microscopy_files(file_id),
    
    -- Metrics from your CSV
    region_pixels BIGINT NOT NULL,
    region_area_mm FLOAT,      -- Mapped from 'Region area'
    object_count INT,          -- Handles 'N/A' by storing NULL
    object_pixels BIGINT,
    object_area_mm FLOAT,
    load FLOAT NOT NULL,
    norm_load FLOAT,
    
    -- Metadata
    hemisphere VARCHAR(20) NOT NULL CHECK (hemisphere IN ('left','right','bilateral')),
    region_pixels_unit_id INT REFERENCES units(unit_id),
    region_area_unit_id INT REFERENCES units(unit_id),
    object_count_unit_id INT REFERENCES units(unit_id),
    object_pixels_unit_id INT REFERENCES units(unit_id),
    object_area_unit_id INT REFERENCES units(unit_id),
    load_unit_id INT REFERENCES units(unit_id),

    CONSTRAINT region_counts_uniq UNIQUE (subject_id, region_id, hemisphere)
);

-- 5. Ingest log for provenance
CREATE TABLE ingest_log (
    ingest_id SERIAL PRIMARY KEY,
    source_path TEXT,
    checksum CHAR(64),
    rows_loaded INT,
    status VARCHAR(20),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_region_counts_subject ON region_counts(subject_id);
CREATE INDEX idx_region_counts_region ON region_counts(region_id);
CREATE INDEX idx_region_counts_hemi ON region_counts(hemisphere);
CREATE INDEX idx_brain_regions_parent ON brain_regions(parent_id);
CREATE INDEX idx_microscopy_files_session ON microscopy_files(session_id);
