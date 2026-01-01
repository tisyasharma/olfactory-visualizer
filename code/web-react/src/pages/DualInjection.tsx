import { useState } from 'react';
import { Sidebar } from '@/components/layout';
import { RegionSelector, ViewSwitcher, ZoomControls } from '@/components/controls';
import { AbstractSection, Tooltip, InterpretationPanel } from '@/components/shared';
import { DivergingBarChart } from '@/components/visualizations/DivergingBarChart';
import { ScatterPlot } from '@/components/visualizations/ScatterPlot';
import { useApiData, useRegionSelection, useTooltip } from '@/hooks';
import { useRegionTree } from '@/context';
import { regionLoadAPI } from '@/api';
import { DEFAULT_DUAL_INJECTION_REGIONS } from '@/utils';

type DualInjectionView = 'diverging' | 'scatter';

export function DualInjection() {
  const [view, setView] = useState<DualInjectionView>('diverging');
  const { tooltipState, showTooltip, hideTooltip } = useTooltip();
  const { regionNameToAcronym } = useRegionTree();

  // Fetch data
  const { data, loading } = useApiData(
    () => regionLoadAPI.byMouse({ experiment_type: 'double_injection' }),
    []
  );

  // Get available regions from data
  const availableRegions = Array.from(new Set((data || []).map((d) => d.region))).sort();

  // Region selection
  const { selectedRegions, setSelectedRegions } = useRegionSelection({
    availableRegions,
    defaultRegions: DEFAULT_DUAL_INJECTION_REGIONS,
    storageKey: `dual-injection-regions-${view}`,
  });

  return (
    <>
      <section className="section" style={{ paddingTop: '96px' }}>
        <div className="container">
          <div className="rabies-layout card">
            <Sidebar className="rabies-sidebar--double">
              <RegionSelector
                regions={availableRegions}
                selectedRegions={selectedRegions}
                onSelectionChange={setSelectedRegions}
                defaultRegions={DEFAULT_DUAL_INJECTION_REGIONS}
                id="doubleRegionSearch"
              />
            </Sidebar>

            <div className="rabies-main">
              <AbstractSection
                title="Circuit Anatomy: Dual-Viral Tracing"
                titleIcon={<span className="dot" style={{ '--c': 'var(--accent2)' } as React.CSSProperties} />}
                id="doubleAbstractBody"
              >
                <div className="muted small">
                  <p>
                    <strong>Rationale:</strong> To define the specificity of interhemispheric projections, we employed a
                    dual-viral approach comparing two populations: (1) <strong>Contra-projecting neurons</strong> (labeled via
                    retrograde tracing from the contralateral AON) and (2) <strong>General VGLUT1+ neurons</strong> (labeled via
                    AAV injection in the same hemisphere). By measuring axonal density in downstream targets, we determine whether
                    interhemispheric neurons are anatomically distinct or simply a representative sample of the broader excitatory
                    population.
                  </p>
                  <p>
                    <strong>Virus:</strong> AAV-retro vs. AAV-anterograde | Genotype: VGLUT1-Cre | N=__ mice
                  </p>
                </div>
              </AbstractSection>

              <div className="zoom-controls-row">
                <div className="zoom-controls-group">
                  <ViewSwitcher
                    options={['diverging', 'scatter'] as const}
                    value={view}
                    onChange={setView}
                    labels={{ diverging: 'Diverging Bars', scatter: 'Correlation Scatter' }}
                    ariaLabel="Select dual injection view"
                  />
                  <ZoomControls zoomLevel={1.0} onReset={() => {}} id="doubleZoomLevel" />
                </div>
              </div>

              <div className="figure-head figure-head--center" id="doubleFigureHead" />

              <div className="figure-panel" style={{ flex: 1, minHeight: 0 }}>
                <div className="panel-a" style={{ border: 'none', width: '100%', height: '100%', overflow: 'hidden' }}>
                  {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>Loading data...</div>
                  ) : view === 'diverging' ? (
                    <DivergingBarChart
                      data={data || []}
                      selectedRegions={selectedRegions}
                      regionNameToAcronym={regionNameToAcronym}
                      onTooltipShow={showTooltip}
                      onTooltipHide={hideTooltip}
                    />
                  ) : (
                    <ScatterPlot
                      data={data || []}
                      selectedRegions={selectedRegions}
                      onTooltipShow={showTooltip}
                      onTooltipHide={hideTooltip}
                    />
                  )}
                </div>
              </div>

              <InterpretationPanel>
                {view === 'diverging' ? (
                  <div className="figure-insight__grid">
                    <div className="figure-insight__block">
                      <div className="insight-label">
                        <span className="insight-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="4" width="16" height="16" rx="3" />
                            <line x1="8" y1="16" x2="8" y2="12" />
                            <line x1="12" y1="16" x2="12" y2="10" />
                            <line x1="16" y1="16" x2="16" y2="8" />
                          </svg>
                        </span>
                        <span>THE METRIC</span>
                      </div>
                      <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                        <li style={{ marginBottom: '4px' }}>
                          <strong>Percentage Area Covered:</strong> Values represent the density of axonal collaterals in the target region.
                        </li>
                        <li>
                          <strong>The Delta (Difference):</strong>{' '}
                          <span style={{ color: 'var(--accent1)', fontWeight: 600 }}>Red bars</span> indicate targets favored by
                          Contra-projecting cells. <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>Blue bars</span> indicate targets
                          favored by the General VGLUT1 population.
                        </li>
                      </ul>
                    </div>
                    <div className="figure-insight__divider" aria-hidden="true" />
                    <div className="figure-insight__block">
                      <div className="insight-label">
                        <span className="insight-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="2.6" />
                          </svg>
                        </span>
                        <span>THE POPULATIONS</span>
                      </div>
                      <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                        <li style={{ marginBottom: '4px' }}>
                          <strong>General VGLUT1 (Blue):</strong> Represents the broad output of normal excitatory neurons in the AON.
                        </li>
                        <li>
                          <strong>Contra-Projecting (Red):</strong> Represents the specific subset of neurons that project across the anterior
                          commissure.
                        </li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="figure-insight__grid">
                    <div className="figure-insight__block">
                      <p className="insight-text">
                        Each point represents a brain region. Position along the <strong>identity line</strong> (dashed) indicates similar targeting
                        by both populations. Points <strong>above the line</strong> are favored by Contra-projecting neurons; points{' '}
                        <strong>below</strong> are favored by General VGLUT1.
                      </p>
                    </div>
                  </div>
                )}
              </InterpretationPanel>

              <Tooltip
                id="doubleTooltip"
                content={tooltipState.content}
                visible={tooltipState.visible}
                x={tooltipState.x}
                y={tooltipState.y}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
