import { Link } from 'react-router-dom';

export function Home() {
  return (
    <>
      <header id="top" className="hero">
        <div className="container hero-shell">
          <div className="hero-shell__left">
            <p className="kicker">Tisya Sharma</p>
            <h1>Olfactory Data Visualizer</h1>
            <p className="lede">Dashboard for AON Interhemispheric Connections</p>
            <div className="legend legend--stacked">
              <div className="legend__item">
                <span className="dot" style={{ '--c': 'var(--accent2)' } as React.CSSProperties} />
                <span>Circuit Anatomy: Dual-Viral Tracing</span>
              </div>
              <div className="legend__item">
                <span className="dot" style={{ '--c': 'var(--accent1)' } as React.CSSProperties} />
                <span>Input Mapping: Monosynaptic Rabies Tracing</span>
              </div>
              <div className="legend__item">
                <span className="dot" style={{ '--c': 'var(--accent3)' } as React.CSSProperties} />
                <span>Molecular Profiling: Single-Cell RNA Sequencing</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="section">
        <div className="container container--wide">
          <div className="card" style={{ maxWidth: '900px', margin: '0 auto', padding: '40px' }}>
            <div className="intro-grid">
              <div className="intro-block">
                <h3 className="kicker" style={{ fontSize: '14px', marginBottom: '12px' }}>
                  Experimental Rationale
                </h3>
                <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#374151', marginBottom: '16px' }}>
                  <strong>Significance:</strong> The Anterior Olfactory Nucleus (AON) occupies a unique
                  position as the brain's first site of bilateral olfactory integration. Unlike vision or
                  audition, olfactory pathways remain unilateral until the cortex, making the AON the
                  critical bottleneck for the interhemispheric communication required for odor
                  localization and memory. Clinically, it is also among the earliest regions to degenerate
                  in Alzheimer's and Parkinson's Disease.
                </p>
                <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#374151', marginBottom: '16px' }}>
                  To characterize this vital circuit, this dashboard integrates a multi-modal
                  interrogation of the AON. By combining <strong>Dual-Viral Mapping</strong> (Anatomy),{' '}
                  <strong>Monosynaptic Rabies Tracing</strong> (Connectivity), and{' '}
                  <strong>snRNA-sequencing</strong> (Identity), we define the structural organization and
                  molecular profile of these interhemispheric connections.
                </p>
                <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#374151' }}>
                  <strong style={{ color: '#111827' }}>Key Insight:</strong> Our data reveals that
                  interhemispheric neurons are a molecularly distinct, excitatory population that
                  specifically targets olfactory centers while avoiding non-olfactory outputs. This
                  specialized circuitry provides the structural basis for how the brain integrates
                  bilateral information to drive behavior.
                </p>
              </div>
              <div style={{ height: '1px', background: '#e5e7eb', margin: '32px 0' }} />
              <div className="intro-block">
                <h3 className="kicker" style={{ fontSize: '14px', marginBottom: '12px' }}>
                  Key Findings
                </h3>
                <ul
                  className="expected-list"
                  style={{
                    fontSize: '15px',
                    color: '#374151',
                    gap: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <li>
                    <span style={{ color: '#111827' }}>Anatomy:</span> Interhemispheric axons originate
                    primarily from the Dorsolateral AON and are exclusively VGLUT1+ (excitatory).
                  </li>
                  <li>
                    <span style={{ color: '#111827' }}>Connectivity:</span> Long-range inputs synapse
                    onto both Excitatory and Inhibitory populations.
                  </li>
                  <li>
                    <span style={{ color: '#111827' }}>Identity:</span> Transcriptomic profiling
                    identifies __ distinct clusters.
                  </li>
                </ul>
              </div>
            </div>

            <div
              className="intro-actions"
              style={{
                marginTop: '40px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              <Link to="/dual-injection" className="btn-card">
                <span className="dot" style={{ '--c': 'var(--accent2)' } as React.CSSProperties} />
                <strong>Explore Dual Injection</strong>
                <span className="muted small">Circuit Anatomy</span>
              </Link>
              <Link to="/rabies" className="btn-card">
                <span className="dot" style={{ '--c': 'var(--accent1)' } as React.CSSProperties} />
                <strong>Explore Rabies Tracing</strong>
                <span className="muted small">Input Mapping</span>
              </Link>
              <Link to="/scrna" className="btn-card">
                <span className="dot" style={{ '--c': 'var(--accent3)' } as React.CSSProperties} />
                <strong>Explore scRNA-seq</strong>
                <span className="muted small">Molecular Profiling</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
