import { useState } from 'react';
import { regionLoadAPI } from '@/api/endpoints';
import { useApiData, useRegionSelection, useTooltip } from '@/hooks';
import { Sidebar, RegionSelector, ViewSwitcher, AbstractSection, InterpretationPanel, Tooltip } from '@/components';
import { ClevelandDotPlot, GroupedBarChart } from '@/components/visualizations';
import { DEFAULT_RABIES_DOT_REGIONS, DEFAULT_RABIES_BAR_REGIONS } from '@/utils/constants';
import { useRegionTree } from '@/context';

type RabiesView = 'dot' | 'bar';
type GroupBy = 'genotype' | 'subject';

export function RabiesTracing() {
  const [view, setView] = useState<RabiesView>('dot');
  const [groupBy, setGroupBy] = useState<GroupBy>('genotype');
  const { tooltipState, showTooltip, hideTooltip } = useTooltip();
  const { regionNameToAcronym } = useRegionTree();

  // Fetch both hemispheres in parallel
  const { data: ipsiData, loading: ipsiLoading } = useApiData(
    () => regionLoadAPI.byMouse({ experiment_type: 'rabies', hemisphere: 'right' }),
    []
  );

  const { data: contraData, loading: contraLoading } = useApiData(
    () => regionLoadAPI.byMouse({ experiment_type: 'rabies', hemisphere: 'left' }),
    []
  );

  const loading = ipsiLoading || contraLoading;
  const allData = [...(ipsiData || []), ...(contraData || [])];

  // Get available regions from data
  const availableRegions = Array.from(
    new Set(allData.map((d) => d.region))
  ).sort();

  // Default regions depend on view
  const defaultRegions = view === 'dot' ? DEFAULT_RABIES_DOT_REGIONS : DEFAULT_RABIES_BAR_REGIONS;

  const { selectedRegions, setSelectedRegions } = useRegionSelection({
    availableRegions,
    defaultRegions,
    storageKey: `rabies-regions-${view}`,
  });

  // Filter to only allowed genotypes
  const filteredIpsiData = (ipsiData || []).filter(
    (d) => d.genotype === 'Vglut1' || d.genotype === 'Vgat'
  );
  const filteredContraData = (contraData || []).filter(
    (d) => d.genotype === 'Vglut1' || d.genotype === 'Vgat'
  );

  return (
    <section className="section" style={{ paddingTop: '96px' }}>
      <div className="container">
        <div className="rabies-layout card">
          <Sidebar>
          <RegionSelector
            regions={availableRegions}
            selectedRegions={selectedRegions}
            onSelectionChange={setSelectedRegions}
            defaultRegions={defaultRegions}
            dataRegions={new Set(availableRegions)}
          />

          {view === 'dot' && (
            <div className="controls__block" style={{ marginTop: '20px' }}>
              <h3 className="controls__label">Group By</h3>
              <ViewSwitcher
                options={['genotype', 'subject'] as const}
                value={groupBy}
                onChange={setGroupBy}
                labels={{ genotype: 'Genotype', subject: 'Subject' }}
                vertical
              />
            </div>
          )}
        </Sidebar>

        <div className="rabies-main" style={{ position: 'relative' }}>
          <AbstractSection
            title="Input Mapping: Monosynaptic Rabies Tracing"
            titleIcon={<span className="dot" style={{ '--c': 'var(--accent1)' } as React.CSSProperties} />}
          >
            <div className="muted small">
              <p>
                <strong>Rationale:</strong> To dissect how the anterior olfactory nucleus (AON) integrates information across hemispheres, 
                we used monosynaptic rabies tracing to map presynaptic inputs onto genetically defined AON cell types. While anterograde tracing
                established that interhemispheric AON projections arise from excitatory (VGLUT1+) neurons, the functional impact of these projections 
                depends on which neurons they synapse onto. By using VGLUT1-Cre and VGAT-Cre mice as starter populations, this experiment maps and 
                compares the relative distribution of presynaptic inputs onto excitatory versus inhibitory AON neurons across the brain. This approach 
                reveals whether long-range inputs, including those from the contralateral hemisphere and other olfactory regions, preferentially target 
                excitation or inhibition. Together, these patterns define the circuit architecture that can support bilateral integration through 
                coordinated excitation and inhibition.
              </p>
              <p>
                <strong>Context: </strong> VGLUT1 (Excitatory): These neurons release glutamate to drive downstream activity and propagate information forward.
                  VGAT (Inhibitory): These neurons release GABA to suppress activity, reduce noise, and sculpt signal timing.
              </p>
              <p className="muted small">
                <strong>Virus: </strong>EnvA-ΔG-Rabies | Starters: vGLUT1-Cre, vGAT-Cre | N=<span id="rabiesMouseCount">–</span> mice
              </p>
            </div>
          </AbstractSection>

          <div className="figure-head" style={{ marginTop: '32px' }}>
            <div className="figure-title">
              {view === 'dot'
                ? 'Bilateral Synaptic Inputs of Olfactory Areas'
                : 'Afferent Inputs to AON (Interhemispheric Connectivity)'}
            </div>
            <div className="muted small">
              Distribution of Projections to Excitatory (VGLUT1) and Inhibitory (VGAT) Neurons
            </div>
          </div>

          <div className="zoom-controls-row">
            <div className="zoom-controls-group">
              <ViewSwitcher
                options={['dot', 'bar'] as const}
                value={view}
                onChange={setView}
                labels={{ dot: 'Dot Plot', bar: 'Stacked Bars' }}
              />
              <div className="zoom-controls">
                <span className="zoom-controls__level">1.0x</span>
                <span className="zoom-controls__divider">|</span>
                <button className="zoom-controls__btn" type="button">Reset</button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="muted" style={{ padding: '40px', textAlign: 'center' }}>
              Loading rabies tracing data...
            </div>
          )}

          {!loading && view === 'dot' && (
            <ClevelandDotPlot
              ipsiData={filteredIpsiData}
              contraData={filteredContraData}
              selectedRegions={selectedRegions}
              groupBy={groupBy}
              regionNameToAcronym={regionNameToAcronym}
              onTooltipShow={showTooltip}
              onTooltipHide={hideTooltip}
            />
          )}

          {!loading && view === 'bar' && (
            <GroupedBarChart
              ipsiData={filteredIpsiData}
              contraData={filteredContraData}
              selectedRegions={selectedRegions}
              regionNameToAcronym={regionNameToAcronym}
              onTooltipShow={showTooltip}
              onTooltipHide={hideTooltip}
            />
          )}

          <InterpretationPanel>
            {view === 'dot' ? (
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
                      <li style={{ marginBottom: '4px' }}><strong>Normalization:</strong> X-axis uses log10 values normalized to <strong>Injection Size</strong> (total ipsilateral signal) to account for uptake differences.</li>
                      <li><strong>Log Scale:</strong> One tick on the scale equals a <strong>10-fold</strong> change in connection strength.</li>
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
                      <span>THE SIGNAL</span>
                    </div>
                    <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                      <li><strong>VGLUT1 (Excitatory):</strong> Driver inputs that tell the circuit to fire.</li>
                      <li><strong>VGAT (Inhibitory):</strong> Gating/control inputs that tell the circuit to stop, often used to filter out noise.</li>
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
                    <span>PANEL COMPARISON: Ipsilateral vs. Contralateral</span>
                  </div>
                  <p className="insight-text"><strong>Ipsilateral:</strong> Robust local inputs from the injected hemisphere (higher because starter cells live here).<br/><strong>Contralateral:</strong> Sparse long-range projections from the opposite hemisphere; these are the interhemispheric inputs of interest.</p>
                </div>
              </>
            ) : (
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
                      <li style={{ marginBottom: '4px' }}><strong>Normalization:</strong> The data is displayed as a percentage of the total viral uptake at the injection site. The AON, being the injection site, naturally shows the highest signal intensity.</li>
                      <li><strong>Log Scale:</strong> The connection strengths span over 5 orders of magnitude. The logarithmic scale allows you to compare massive inputs (like the AON's recurrent loop) with subtle, long-range modulators on the same chart. </li>
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
                      <span>THE SIGNAL</span>
                    </div>
                    <ul className="insight-text" style={{ margin: 0, paddingLeft: '18px' }}>
                      <li><strong>VGAT vs. VGLUT1:</strong> Compare paired bars per region to see inhibitory vs. excitatory dominance.</li>
                      <li><strong>Ranked by strength:</strong> Regions are sorted by their strongest genotype mean so high-signal inputs float to the top.</li>
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
                    <span>ANATOMICAL HEIRARCHY</span>
                  </div>
                  <p className="insight-text">The regions at the top (AON, LOT, Anterior Commissure) are the primary highways for interhemispheric information.
                                              Regions lower on the list (like Endopiriform Nucleus) provide sparse, modulatory feedback. If a bar is missing for a specific genotype,
                                              it indicates that no significant monosynaptic connections were detected from that cell type in that region.</p>
                </div>
              </>
            )}
          </InterpretationPanel>

          <Tooltip {...tooltipState} id="rabies-tooltip" />
        </div>
      </div>
      </div>
    </section>
  );
}
