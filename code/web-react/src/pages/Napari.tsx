/**
 * Microscopy Viewer Page
 *
 * In-browser OME-Zarr slice viewer using Viv (@hms-dbmi/viv).
 * This viewer provides interactive 2D slice navigation, pan/zoom controls,
 * and mouse wheel support for exploring microscopy imaging data.
 *
 * Stacks are loaded from the database via /api/v1/microscopy-stacks
 */
import { useState, useEffect } from 'react';
import { OmeZarrSliceViewer } from '@/components/viewer';
import { microscopyStacksAPI, type MicroscopyStack } from '@/api/endpoints';

export function Napari() {
  const [stacks, setStacks] = useState<MicroscopyStack[]>([]);
  const [selectedStack, setSelectedStack] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStacks() {
      try {
        setLoading(true);
        setError(null);
        const data = await microscopyStacksAPI.list();
        setStacks(data);
        if (data.length > 0) {
          setSelectedStack(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load microscopy stacks');
      } finally {
        setLoading(false);
      }
    }
    loadStacks();
  }, []);

  const currentStack = stacks.find((s) => s.id === selectedStack);

  return (
    <section className="section" style={{ paddingTop: '96px' }}>
      <div className="container">
        <div className="section__head">
          <div>
            <p className="kicker">Visualization</p>
            <h3>Microscopy Viewer</h3>
            <p className="muted">
              Interactive 2D slice viewer for OME-Zarr microscopy imaging data.
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '40px', marginTop: '24px' }}>
          {/* Stack selector */}
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="stack-selector" style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
              Select Stack
            </label>
            {loading ? (
              <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading stacks...</p>
            ) : error ? (
              <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626' }}>
                Error loading stacks: {error}
              </div>
            ) : (
              <select
                id="stack-selector"
                value={selectedStack}
                onChange={(e) => setSelectedStack(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '500px',
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                {stacks.map((stack) => (
                  <option key={stack.id} value={stack.id}>
                    {stack.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Viewer */}
          {currentStack ? (
            <div>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                Loading stack: {currentStack.name}
              </p>
              <OmeZarrSliceViewer zarrUrl={currentStack.url} initialZ={0} />
            </div>
          ) : !loading && !error ? (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: '#6b7280',
                background: '#f9fafb',
                borderRadius: '8px',
              }}
            >
              <p style={{ margin: 0 }}>No stacks available.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
