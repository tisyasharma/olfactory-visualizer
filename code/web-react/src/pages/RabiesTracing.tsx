import { useState } from 'react';
import { regionLoadAPI } from '@/api/endpoints';
import { useApiData, useRegionSelection, useTooltip } from '@/hooks';
import { Sidebar, RegionSelector, ViewSwitcher, AbstractSection, InterpretationPanel, Tooltip } from '@/components';
import { DEFAULT_RABIES_DOT_REGIONS, DEFAULT_RABIES_BAR_REGIONS } from '@/utils/constants';

type RabiesView = 'dot' | 'bar';
type GroupBy = 'genotype' | 'subject';

export function RabiesTracing() {
  const [view, setView] = useState<RabiesView>('dot');
  const [groupBy, setGroupBy] = useState<GroupBy>('genotype');
  const { tooltipState } = useTooltip();

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

  // Prevent warnings by using groupBy
  console.log('Current groupBy:', groupBy);

  return (
    <section className="section">
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

        <div className="rabies-main">
          <AbstractSection title="Circuit Anatomy: Monosynaptic Rabies Tracing">
            <p>
              We used monosynaptic rabies tracing to identify direct inputs to excitatory (VGLUT1+) and
              inhibitory (VGAT+) neurons in the AON. Rabies virus injected into the right AON retrogradely
              labels presynaptic neurons, allowing us to map both ipsilateral (right hemisphere) and
              contralateral (left hemisphere) inputs.
            </p>
            <p>
              <strong>Experimental approach:</strong> AAV-FLEX-TVA-mCherry and AAV-FLEX-RG were injected
              into the right AON of Cre-driver mice. Three weeks later, EnvA-pseudotyped rabies virus was
              injected at the same location. Brains were collected 7 days post-rabies injection, cleared,
              and imaged using light-sheet microscopy.
            </p>
            <p>
              <strong>Key finding:</strong> The dot plot reveals bilateral inputs to both cell types, with
              significant projections from olfactory areas, cortical areas, and thalamic nuclei. The bar
              chart highlights the balance between ipsilateral and contralateral afferents across major
              olfactory regions.
            </p>
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

          <ViewSwitcher
            options={['dot', 'bar'] as const}
            value={view}
            onChange={setView}
            labels={{ dot: 'Cleveland Dot Plot', bar: 'Diverging Bar Chart' }}
          />

          {loading && (
            <div className="muted" style={{ padding: '40px', textAlign: 'center' }}>
              Loading rabies tracing data...
            </div>
          )}

          {!loading && (
            <div className="rabies-panels">
              <div className="muted" style={{ padding: '40px', textAlign: 'center' }}>
                {view === 'dot'
                  ? 'Cleveland Dot Plot visualization (ClevelandDotPlot component) - Migration pending'
                  : 'Diverging Bar Chart visualization (GroupedBarChart component) - Migration pending'}
                <br />
                <br />
                <div className="small">
                  Data loaded: {filteredIpsiData.length} ipsilateral records, {filteredContraData.length}{' '}
                  contralateral records
                </div>
              </div>
            </div>
          )}

          <InterpretationPanel>
            {view === 'dot' ? (
              <div className="figure-insight__grid">
                <div className="figure-insight__block">
                  <p className="insight-text">
                    <strong>Bilateral input pattern:</strong> Both ipsilateral (right, injection side) and
                    contralateral (left) hemispheres send projections to the AON. Regions are ordered by
                    total connectivity strength.
                  </p>
                  <p className="insight-text">
                    <strong>Cell-type specificity:</strong> VGLUT1+ (excitatory) and VGAT+ (inhibitory)
                    neurons receive similar afferent patterns, but with varying strengths across regions.
                    Notice the strong olfactory bulb and piriform inputs to both cell types.
                  </p>
                  <p className="insight-text">
                    <strong>Grouping options:</strong> "Genotype" groups points by cell type (VGLUT1 vs
                    VGAT), while "Subject" groups by individual mouse, allowing assessment of inter-animal
                    variability.
                  </p>
                </div>
              </div>
            ) : (
              <div className="figure-insight__grid">
                <div className="figure-insight__block">
                  <p className="insight-text">
                    <strong>Interhemispheric balance:</strong> The diverging bar chart shows the relative
                    strength of ipsilateral (right, injection side) vs. contralateral (left) inputs to the
                    AON. Bars extending left represent contralateral dominance, while bars extending right
                    indicate ipsilateral dominance.
                  </p>
                  <p className="insight-text">
                    <strong>Olfactory connectivity:</strong> Notice how olfactory regions like the main
                    olfactory bulb and piriform area show strong bilateral connectivity, while other regions
                    may show hemispheric preference.
                  </p>
                </div>
              </div>
            )}
          </InterpretationPanel>

          <Tooltip {...tooltipState} />
        </div>
      </div>
    </section>
  );
}
