/**
 * OME-Zarr Slice Viewer Component
 *
 * Uses @hms-dbmi/viv for web-native OME-Zarr visualization.
 * This component provides a 2D slice viewer with Z-axis navigation,
 * pan/zoom controls, and mouse wheel support.
 *
 * Dependencies:
 * - @hms-dbmi/viv: Lightweight library for viewing OME-Zarr in the browser
 *
 * To configure sample stack URLs, see src/utils/constants.ts (SAMPLE_ZARR_STACKS)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { LoadingSpinner } from '@/components/shared';
// Import loadOmeZarr from vivjs loaders
import { loadOmeZarr } from '@vivjs/loaders';
import { API_BASE_URL } from '@/utils/constants';

interface OmeZarrSliceViewerProps {
  zarrUrl: string;
  initialZ?: number;
}

interface ViewerState {
  loading: boolean;
  error: string | null;
  zSize: number;
  currentZ: number;
  loader: any | null;
  imageData: ImageData | null;
  dimensions: { width: number; height: number } | null;
}

export function OmeZarrSliceViewer({ zarrUrl, initialZ = 0 }: OmeZarrSliceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>({
    loading: true,
    error: null,
    zSize: 0,
    currentZ: initialZ,
    loader: null,
    imageData: null,
    dimensions: null,
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isDraggingRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  // Load OME-Zarr data
  useEffect(() => {
    if (!zarrUrl) {
      setState((prev) => ({ ...prev, loading: false, error: 'No Zarr URL provided' }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    
    // Normalize URL - remove trailing slash (Zarr doesn't need it)
    // Zarr loaders need absolute URLs to access metadata files (.zattrs, .zgroup, etc.)
    // Use absolute URL pointing directly to backend server
    let finalUrl = zarrUrl;
    if (finalUrl.endsWith('/')) {
      finalUrl = finalUrl.slice(0, -1);
    }
    
    // Convert relative URLs to absolute URLs pointing to backend
    if (finalUrl.startsWith('/data/')) {
      // For /data/ URLs, use absolute backend URL from constants
      finalUrl = `${API_BASE_URL}${finalUrl}`;
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      // Relative URL without leading / - prepend backend URL from constants
      finalUrl = `${API_BASE_URL}/${finalUrl}`;
    }
    
    // Try loading OME-Zarr
    // The files are multiscale, so we should use the default loader which auto-detects
    // The loadMultiscales option might not be needed or might cause issues
    const tryLoadOmeZarr = () => {
      // Use default loader - it should auto-detect multiscale structure
      return loadOmeZarr(finalUrl)
        .then((loader: any) => {
          const isMultiscale = Array.isArray(loader?.data) && loader.data.length > 1;
          return { loader, isMultiscale };
        });
    };

    // Load the OME-Zarr
    tryLoadOmeZarr()
      .then((result: { loader: any; isMultiscale: boolean }) => {
        const { loader } = result;

        // For multiscale OME-Zarr, Viv returns a loader with data property
        let dataSource = loader;

        if (loader?.data && Array.isArray(loader.data) && loader.data.length > 0) {
          dataSource = loader.data[0];
        } else if (loader?.data) {
          dataSource = loader.data;
        }
        
        // Get shape from the data source
        // Try multiple ways to get the shape
        let shape: number[] = [];
        
        // Method 1: Direct shape property
        if (dataSource?.shape) {
          shape = Array.isArray(dataSource.shape) ? dataSource.shape : [dataSource.shape];
        } 
        // Method 2: From loader
        else if (loader?.shape) {
          shape = Array.isArray(loader.shape) ? loader.shape : [loader.shape];
        }
        // Method 3: Try to get from raster to infer dimensions
        else if (typeof loader?.getRaster === 'function') {
          try {
            const testRaster = loader.getRaster({ selection: { z: 0, t: 0, c: 0 } });
            if (testRaster) {
              // Try to infer from raster dimensions
              const testHeight = testRaster.height || 1;
              const testWidth = testRaster.width || 1;
              // We don't know Z size from one raster, so we'll need to try loading slices
              shape = [1, testHeight, testWidth]; // Placeholder, will update when we load
            }
          } catch {
            // Could not infer shape
          }
        }
        
        // OME-Zarr shape is typically [T, Z, Y, X, C] or [Z, Y, X, C] or [C, Y, X]
        // Extract Z, Y, X dimensions based on axes
        let zSize = 1;
        let height = 1;
        let width = 1;
        
        if (shape.length >= 2) {
          // Check axes if available (from OME metadata)
          const axes = loader?.axes || dataSource?.axes;
          
          if (axes && Array.isArray(axes)) {
            // Use axes to determine dimension order
            const zIdx = axes.indexOf('z');
            const yIdx = axes.indexOf('y');
            const xIdx = axes.indexOf('x');
            const tIdx = axes.indexOf('t');
            const cIdx = axes.indexOf('c');
            
            if (zIdx >= 0 && zIdx < shape.length) zSize = shape[zIdx] || 1;
            if (yIdx >= 0 && yIdx < shape.length) height = shape[yIdx] || 1;
            if (xIdx >= 0 && xIdx < shape.length) width = shape[xIdx] || 1;
          } else {
            // Fallback: infer from shape length
            // Files are written with axes "zyx" or "cyx"
            if (shape.length === 3) {
              // Could be [Z, Y, X] or [C, Y, X]
              // If first dim is small (< 5), it's probably C, otherwise Z
              if (shape[0] < 5) {
                // [C, Y, X] - single slice
                zSize = 1;
                height = shape[1] || 1;
                width = shape[2] || 1;
              } else {
                // [Z, Y, X]
                zSize = shape[0] || 1;
                height = shape[1] || 1;
                width = shape[2] || 1;
              }
            } else if (shape.length === 4) {
              // Could be [T, Z, Y, X] or [Z, Y, X, C] or [C, Z, Y, X]
              // If first dim is small (< 10), it's probably T or C
              if (shape[0] < 10) {
                // [T, Z, Y, X] or [C, Z, Y, X]
                zSize = shape[1] || 1;
                height = shape[2] || 1;
                width = shape[3] || 1;
              } else {
                // [Z, Y, X, C]
                zSize = shape[0] || 1;
                height = shape[1] || 1;
                width = shape[2] || 1;
              }
            } else if (shape.length === 5) {
              // [T, Z, Y, X, C] or [C, T, Z, Y, X]
              zSize = shape[2] || 1;
              height = shape[3] || 1;
              width = shape[4] || 1;
            }
          }
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
          zSize,
          currentZ: Math.min(initialZ, zSize - 1),
          loader: dataSource || loader, // Use dataSource if available, otherwise loader
          dimensions: { width, height },
        }));
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load OME-Zarr stack';
        // Check if it's the multiscale error and provide a more helpful message
        const isMultiscaleError = errorMsg.toLowerCase().includes('multiscale') || 
                                 errorMsg.toLowerCase().includes('only multiscale');
        const isNetworkError = errorMsg.toLowerCase().includes('fetch') || 
                              errorMsg.toLowerCase().includes('network') ||
                              errorMsg.toLowerCase().includes('cors') ||
                              errorMsg.toLowerCase().includes('failed to fetch');
        let finalError: string;
        if (isMultiscaleError) {
          finalError = 'This OME-Zarr file is single-scale, but the viewer requires multiscale format. The files need to be converted to multiscale OME-Zarr format to be viewable.';
        } else if (isNetworkError) {
          finalError = `Network error loading OME-Zarr: ${errorMsg}. Please check that the backend server is running on ${API_BASE_URL} and that CORS is configured correctly.`;
        } else {
          finalError = `Failed to load OME-Zarr: ${errorMsg}`;
        }
        setState({
          loading: false,
          error: finalError,
          zSize: 0,
          currentZ: 0,
          loader: null,
          imageData: null,
          dimensions: null,
        });
      });
  }, [zarrUrl, initialZ]);

  // Load image data for current slice
  useEffect(() => {
    if (!state.loader || state.zSize === 0 || state.loading) return;

    const clampedZ = Math.max(0, Math.min(state.currentZ, state.zSize - 1));
    
    // Use Viv's getRaster method to load slice data
    // For OME-Zarr, selection format is { z: number, t?: number, c?: number }
    try {
      // Check if loader has getRaster method
      if (!state.loader || typeof state.loader.getRaster !== 'function') {
        throw new Error('Loader does not have getRaster method');
      }
      
      // For OME-Zarr, selection format depends on axes
      // Files written with "zyx" axes just need { z: number }
      // Files with "tzyx" or "tcyx" need { z: number, t: 0, c: 0 }
      // Try simple selection first, then fallback if needed
      const tryGetRaster = (sel: any): Promise<any> => {
        try {
          const result = state.loader.getRaster({ selection: sel });
          return Promise.resolve(result);
        } catch (err) {
          return Promise.reject(err);
        }
      };
      
      // Try simple selection first (for "zyx" or "cyx" axes)
      const simpleSelection = { z: clampedZ };
      const complexSelection = { z: clampedZ, t: 0, c: 0 };
      
      const rasterPromise = tryGetRaster(simpleSelection)
        .catch(() => tryGetRaster(complexSelection));
      
      rasterPromise
        .then((data: any) => {
          if (data && data.data) {
            // Handle different data formats from Viv
            let pixelData: Uint8ClampedArray;
            let dataWidth: number;
            let dataHeight: number;

            if (data.data instanceof Uint8ClampedArray) {
              pixelData = data.data;
              dataWidth = data.width || state.dimensions?.width || 1;
              dataHeight = data.height || state.dimensions?.height || 1;
            } else if (data.data instanceof Uint8Array) {
              // Convert Uint8Array to Uint8ClampedArray
              const arr = new Uint8ClampedArray(data.data.length);
              arr.set(data.data);
              pixelData = arr;
              dataWidth = data.width || state.dimensions?.width || 1;
              dataHeight = data.height || state.dimensions?.height || 1;
            } else if (data.data instanceof ArrayBuffer) {
              pixelData = new Uint8ClampedArray(data.data);
              dataWidth = data.width || state.dimensions?.width || 1;
              dataHeight = data.height || state.dimensions?.height || 1;
            } else if (Array.isArray(data.data)) {
              pixelData = new Uint8ClampedArray(data.data);
              dataWidth = data.width || state.dimensions?.width || 1;
              dataHeight = data.height || state.dimensions?.height || 1;
            } else {
              // Try to extract from loader directly
              const shape = state.loader.data?.shape || state.loader.shape || [];
              dataWidth = shape[2] || state.dimensions?.width || 1;
              dataHeight = shape[1] || state.dimensions?.height || 1;
              // Create a placeholder if we can't get the data
              pixelData = new Uint8ClampedArray(dataWidth * dataHeight * 4);
              pixelData.fill(128); // Gray placeholder
            }

            // Ensure pixelData is a proper Uint8ClampedArray for ImageData
            // Create a new array to avoid type issues with ArrayBufferLike
            const clampedData = new Uint8ClampedArray(pixelData.length);
            clampedData.set(pixelData);
            const imageData = new ImageData(clampedData, dataWidth, dataHeight);
            setState((prev) => ({ ...prev, imageData, error: null }));
          } else {
            if (state.dimensions) {
              const { width, height } = state.dimensions;
              const placeholder = new Uint8ClampedArray(width * height * 4);
              placeholder.fill(200);
              const imageData = new ImageData(placeholder, width, height);
              setState((prev) => ({ ...prev, imageData }));
            }
          }
        })
        .catch(() => {
          if (state.dimensions) {
            const { width, height } = state.dimensions;
            const placeholder = new Uint8ClampedArray(width * height * 4);
            placeholder.fill(200); // Light gray placeholder
            const imageData = new ImageData(placeholder, width, height);
            setState((prev) => ({ ...prev, imageData, error: 'Failed to load slice data' }));
          }
        });
    } catch {
      setState((prev) => ({ ...prev, error: 'Error loading slice' }));
    }
  }, [state.currentZ, state.loader, state.zSize, state.loading, state.dimensions]);

  // Render to canvas
  useEffect(() => {
    if (!canvasRef.current || !state.imageData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.putImageData(state.imageData, 0, 0);
    ctx.restore();
  }, [state.imageData, pan, zoom]);

  // Handle canvas resize
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
          // Re-render if we have image data
          if (state.imageData) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.save();
              ctx.translate(pan.x, pan.y);
              ctx.scale(zoom, zoom);
              ctx.putImageData(state.imageData, 0, 0);
              ctx.restore();
            }
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [state.imageData, pan, zoom]);

  // Mouse wheel handler for Z-axis navigation
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (state.zSize === 0) return;

      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1;
      setState((prev) => ({
        ...prev,
        currentZ: Math.max(0, Math.min(prev.zSize - 1, prev.currentZ + delta)),
      }));
    },
    [state.zSize]
  );

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    isDraggingRef.current = true;
    lastPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    setPan({
      x: e.clientX - lastPanRef.current.x,
      y: e.clientY - lastPanRef.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Zoom handlers
  const handleZoom = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.max(0.1, Math.min(5, prev * delta)));
    }
  }, []);

  const handleZChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newZ = parseInt(e.target.value, 10);
    setState((prev) => ({
      ...prev,
      currentZ: Math.max(0, Math.min(prev.zSize - 1, newZ)),
    }));
  }, []);

  if (state.loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <LoadingSpinner label="Loading OME-Zarr stack..." />
      </div>
    );
  }

  if (state.error && !state.imageData) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: '#dc2626',
          background: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fecaca',
        }}
      >
        <h4 style={{ margin: '0 0 8px 0' }}>Error loading OME-Zarr</h4>
        <p style={{ margin: 0, fontSize: '14px' }}>{state.error}</p>
      </div>
    );
  }

  if (state.zSize === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: '#6b7280',
          background: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        <p style={{ margin: 0 }}>No slices available in this stack.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Z-axis slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label htmlFor="z-slider" style={{ fontSize: '14px', fontWeight: 500, minWidth: '80px' }}>
          Slice {state.currentZ + 1} / {state.zSize}
        </label>
        <input
          id="z-slider"
          type="range"
          min="0"
          max={state.zSize - 1}
          value={state.currentZ}
          onChange={handleZChange}
          style={{ flex: 1, cursor: 'pointer' }}
        />
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '600px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#000',
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
        }}
        onWheel={(e) => {
          // Only prevent default if we're actually handling the event
          if (state.zSize > 0 || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
          }
          handleWheel(e);
          handleZoom(e);
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            imageRendering: 'pixelated',
          }}
        />
      </div>

      {/* Controls hint */}
      <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
        <span>Mouse wheel: change slice | Ctrl/Cmd + wheel: zoom | Click + drag: pan</span>
      </div>
    </div>
  );
}
