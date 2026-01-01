import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RegionTreeProvider } from '@/context';
import { Navigation } from '@/components/layout';
import { Home, DualInjection, RabiesTracing, ScRNA, Upload, Napari } from '@/pages';

function App() {
  return (
    <RegionTreeProvider>
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dual-injection" element={<DualInjection />} />
          <Route path="/rabies" element={<RabiesTracing />} />
          <Route path="/scrna" element={<ScRNA />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/napari" element={<Napari />} />
        </Routes>
      </BrowserRouter>
    </RegionTreeProvider>
  );
}

export default App;
