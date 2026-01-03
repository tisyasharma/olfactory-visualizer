import { useState } from 'react';

export function Upload() {
  const [modality, setModality] = useState('');
  const [date, setDate] = useState('');
  const [comment, setComment] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [csvFiles, setCsvFiles] = useState<{ bilateral: File[]; left: File[]; right: File[] }>({
    bilateral: [],
    left: [],
    right: [],
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const images = files.filter((f) => /\.(png|jpg|jpeg|tif|tiff)$/i.test(f.name));

    if (images.length) {
      setImageFiles((prev) => [...prev, ...images]);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImageFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleCsvSelect = (hemisphere: 'bilateral' | 'left' | 'right', e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCsvFiles((prev) => ({
        ...prev,
        [hemisphere]: [...prev[hemisphere], ...Array.from(e.target.files!)],
      }));
    }
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeCsv = (hemisphere: 'bilateral' | 'left' | 'right', index: number) => {
    setCsvFiles((prev) => ({
      ...prev,
      [hemisphere]: prev[hemisphere].filter((_, i) => i !== index),
    }));
  };

  const handleClear = () => {
    setImageFiles([]);
    setCsvFiles({ bilateral: [], left: [], right: [] });
    setModality('');
    setDate('');
    setComment('');
  };

  const handleRegister = async () => {
    if (!modality || !date) {
      alert('Please select a modality and date');
      return;
    }

    if (imageFiles.length === 0) {
      alert('Please add at least one image file');
      return;
    }

    if (csvFiles.bilateral.length === 0 || csvFiles.left.length === 0 || csvFiles.right.length === 0) {
      alert('Please add CSV files for all three hemispheres (bilateral, ipsilateral, contralateral)');
      return;
    }

    alert('Upload functionality will be implemented with backend integration');
  };

  const isReady = modality && date && imageFiles.length > 0 &&
                  csvFiles.bilateral.length > 0 && csvFiles.left.length > 0 && csvFiles.right.length > 0;

  return (
    <section className="section" style={{ paddingTop: '96px' }}>
      <div className="container container--wide">
        <div className="section__head">
          <div>
            <p className="kicker">Uploads</p>
            <h3>Upload Center</h3>
            <p className="upload-hint">
              To enable Register: Select a modality | Choose a date | Add microscopy images | Add bilateral CSV | Add ipsilateral CSV | Add contralateral CSV
            </p>
          </div>
        </div>

        <div className="card upload-card">
          <div className="upload-row">
            <div className="upload-grid upload-grid--stack">
              <label>
                Modality
                <select id="uploadModality" value={modality} onChange={(e) => setModality(e.target.value)}>
                  <option value="" disabled>
                    Select modality
                  </option>
                  <option value="rabies">Rabies Injection</option>
                  <option value="double_injection">Dual Injection</option>
                  <option value="scrnaseq">RNA Sequencing Data</option>
                </select>
              </label>

              <label>
                Date Run
                <input id="uploadDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>

              <label>
                Comments (optional)
                <input
                  id="uploadComment"
                  type="text"
                  placeholder="Notes for this upload"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>

              <div className="upload-actions">
                <button id="registerBtn" className={`btn ${isReady ? 'btn--ready' : ''}`} onClick={handleRegister} disabled={!isReady}>
                  Register Experiment
                </button>
                <button id="clearBtn" className="btn btn--clear" onClick={handleClear}>
                  Clear
                </button>
              </div>
            </div>

            <div
              className={`uploader uploader--compact ${isDragging ? 'is-hover' : ''}`}
              id="dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input type="file" style={{ display: 'none' }} id="fileInput" multiple onChange={handleImageSelect} accept=".png,.jpg,.jpeg,.tif,.tiff" />

              <div className="uploader__body">
                <div className="uploader__icon">⬆</div>
                <div className="uploader__text">
                  <strong>Drag & drop</strong>
                  <div>OR</div>
                  <div>Use the buttons below to add images and each hemisphere CSV.</div>
                  <div className="uploader__hint">PNG/JPG/TIFF slices — one mouse/session per upload</div>
                </div>
              </div>

              <div className="uploader__actions">
                <div className="counts-upload counts-upload--inline">
                  <div className="counts-upload__head">
                    <span className="file-list__title">Quantification CSVs (upload together — bilateral, ipsilateral, contralateral)</span>
                  </div>
                  <div className="counts-upload__controls">
                    <button className="btn btn--mini" onClick={() => document.getElementById('fileInput')?.click()}>
                      Add Images
                    </button>
                    <button className="btn btn--mini" onClick={() => document.getElementById('csvInputBilateral')?.click()}>
                      Add Bilateral CSV
                    </button>
                    <button className="btn btn--mini" onClick={() => document.getElementById('csvInputLeft')?.click()}>
                      Add Ipsilateral CSV
                    </button>
                    <button className="btn btn--mini" onClick={() => document.getElementById('csvInputRight')?.click()}>
                      Add Contralateral CSV
                    </button>

                    <input
                      type="file"
                      style={{ display: 'none' }}
                      id="csvInputBilateral"
                      accept=".csv"
                      onChange={(e) => handleCsvSelect('bilateral', e)}
                    />
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      id="csvInputLeft"
                      accept=".csv"
                      onChange={(e) => handleCsvSelect('left', e)}
                    />
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      id="csvInputRight"
                      accept=".csv"
                      onChange={(e) => handleCsvSelect('right', e)}
                    />
                  </div>

                  <div id="csvList" className="file-list">
                    {csvFiles.bilateral.map((file, i) => (
                      <div key={`bilateral-${i}`} className="file-item">
                        <span>BILATERAL: {file.name}</span>
                        <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                        <button className="btn btn--mini remove-file" onClick={() => removeCsv('bilateral', i)}>
                          ×
                        </button>
                      </div>
                    ))}
                    {csvFiles.left.map((file, i) => (
                      <div key={`left-${i}`} className="file-item">
                        <span>IPSILATERAL: {file.name}</span>
                        <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                        <button className="btn btn--mini remove-file" onClick={() => removeCsv('left', i)}>
                          ×
                        </button>
                      </div>
                    ))}
                    {csvFiles.right.map((file, i) => (
                      <div key={`right-${i}`} className="file-item">
                        <span>CONTRALATERAL: {file.name}</span>
                        <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                        <button className="btn btn--mini remove-file" onClick={() => removeCsv('right', i)}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <details className="file-list file-list--collapsible" open>
            <summary className="file-list__summary">Image files</summary>
            <div className="file-list__body">
              {imageFiles.map((file, i) => (
                <div key={i} className="file-item">
                  <span>{file.name}</span>
                  <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                  <button className="btn btn--mini remove-file" onClick={() => removeImage(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </details>

          <div className="expected-note">
            <p className="muted small">
              <strong>Expected files</strong>
            </p>
            <ul className="expected-list">
              <li>
                <span>Rabies and Dual Injections:</span> microscopy images (PNG/JPG/TIFF) + three QUINT CSVs (bilateral, ipsilateral, contralateral);
                optional notes.
              </li>
              <li>
                <span>scRNA-sequencing Data:</span> counts (H5/H5AD/MTX/H5AD), cell metadata, gene metadata, pipeline config.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
