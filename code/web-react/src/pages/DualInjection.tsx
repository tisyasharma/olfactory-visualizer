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
                    <strong>Rationale:</strong> To determine if contralaterally projecting neurons have a distinct connectivity profile, we used an intersectional viral strategy. We injected Retrograde-Cre into one AON hemisphere and Cre-dependent GFP into the contralateral hemisphere. This labeled <i>only</i> the neurons projecting across the anterior commissure, allowing us to quantify their axonal collaterals brain-wide and compare them to the general VGLUT1+ population.
                  </p>
                  <p>
                    <strong>Context:</strong> Collaterals (axonal branches) define a neuron's functional output. By comparing the collaterals of interhemispheric cells against the general VGLUT1 population, we determine if these neurons are "specialists" that strictly target olfactory areas or "generalists" that broadcast to the whole brain.
                  </p>
                  <p className="muted small" style={{ marginTop: '8px' }}>
                    <strong>Virus:</strong> Retrograde-AAV-Cre + AAV-FLEX-GFP vs. AAV-GFP | N=__ mice
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
                  <>
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
                          <li style={{ marginBottom: '4px' }}><strong>Percentage Area Covered:</strong> Values represent the density of axonal collaterals in the target region.</li>
                          <li><strong>The Delta (Difference):</strong>{' '}
                            <span style={{ color: 'var(--accent1)', fontWeight: 600 }}>Red bars</span> indicate targets favored by Contra-projecting cells.{' '}
                            <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>Blue bars</span> indicate targets favored by the General VGLUT1 population.
                          </li>
                        </ul>
                      </div>
                      <div className="figure-insight__divider" aria-hidden="true" />
                      <div className="figure-insight__block">
                        <div className="insight-label">
                          <span className="insight-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3v4" />
                              <path d="M6.8 6.8 9.3 9.3" />
                              <path d="M3 12h4" />
                              <path d="M6.8 17.2 9.3 14.7" />
                              <path d="M12 21v-4" />
                              <path d="M17.2 17.2 14.7 14.7" />
                              <path d="M21 12h-4" />
                              <path d="M17.2 6.8 14.7 9.3" />
                              <circle cx="12" cy="12" r="2.6" />
                            </svg>
                          </span>
                          <span>THE POPULATIONS</span>
                        </div>
                        <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                          <li style={{ marginBottom: '4px' }}><strong>General VGLUT1 (Blue):</strong> Represents the broad output of normal excitatory neurons in the AON.</li>
                          <li><strong>Contra-Projecting (Red):</strong> Represents the specific subset of neurons that project across the anterior commissure.</li>
                        </ul>
                      </div>
                    </div>
                    <div className="insight-fullrow">
                      <div className="insight-label">
                        <span className="insight-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="14" rx="3" />
                            <path d="M8 9h8" />
                            <path d="M8 13h5" />
                          </svg>
                        </span>
                        <span>WHAT THIS TELLS US</span>
                      </div>
                      <p className="insight-text">
                        If the bars were all near zero, it would mean interhemispheric neurons are just "average" AON neurons.{' '}
                        <strong>Large diverging bars</strong> reveal that these neurons have a unique connectivity profile, preferentially targeting specific olfactory areas while avoiding others compared to their neighbors.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="figure-insight__grid">
                      <div className="figure-insight__block">
                        <div className="insight-label">
                          <span className="insight-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M3 3v18h18" />
                            </svg>
                          </span>
                          <span>THE AXES</span>
                        </div>
                        <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                          <li style={{ marginBottom: '4px' }}><strong>X-Axis (General VGLUT1):</strong> How strongly the general population projects to a region.</li>
                          <li><strong>Y-Axis (Contra-Projecting):</strong> How strongly the specific interhemispheric neurons project to that same region.</li>
                        </ul>
                      </div>
                      <div className="figure-insight__divider" aria-hidden="true" />
                      <div className="figure-insight__block">
                        <div className="insight-label">
                          <span className="insight-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="4" y1="20" x2="20" y2="4" />
                              <circle cx="15" cy="9" r="2" />
                              <circle cx="9" cy="15" r="2" />
                            </svg>
                          </span>
                          <span>THE IDENTITY LINE</span>
                        </div>
                        <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                          <li style={{ marginBottom: '4px' }}><strong>On the line:</strong> The region receives equal input from both populations (no specialization).</li>
                          <li><strong>Above the line:</strong> The region is a preferred target of Contra-projecting cells.</li>
                          <li><strong>Below the line:</strong> The region is avoided by Contra-projecting cells.</li>
                        </ul>
                      </div>
                    </div>
                    <div className="insight-fullrow">
                      <div className="insight-label">
                        <span className="insight-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="14" rx="3" />
                            <path d="M8 9h8" />
                            <path d="M8 13h5" />
                          </svg>
                        </span>
                        <span>WHAT THIS TELLS US</span>
                      </div>
                      <p className="insight-text">
                        This plot tests for <strong>Scaling vs. Specialization</strong>. If Contra neurons were just "weaker" versions of VGLUT1 neurons, all points would fall on a straight line below the diagonal.{' '}
                        Deviations from the line indicate <strong>targeted rewiring</strong>, where specific regions are selectively upregulated or downregulated.
                      </p>
                    </div>
                  </>
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
