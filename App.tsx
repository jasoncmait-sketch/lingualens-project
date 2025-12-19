import React, { useState, useCallback } from 'react';
import { Uploader } from './components/Uploader';
import { AnnotationOverlay } from './components/AnnotationOverlay';
import { Button } from './components/Button';
import { translateImageText, editImageWithPrompt } from './services/geminiService';
import { AppMode, Annotation, ImageState } from './types';
import { Languages, Wand2, X, Download, RotateCcw, Image as ImageIcon } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.TRANSLATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Image State
  const [imageState, setImageState] = useState<ImageState>({
    original: null,
    processed: null,
    annotations: [],
    width: 0,
    height: 0
  });
  
  // Store user-dragged offsets for annotations: Record<index, {x, y}> (1000-scale)
  const [labelOffsets, setLabelOffsets] = useState<Record<number, {x: number, y: number}>>({});

  const [editPrompt, setEditPrompt] = useState("");

  const handleImageSelect = useCallback((base64: string, type: string) => {
    // Reset state on new image
    setImageState({
      original: `data:${type};base64,${base64}`,
      processed: null,
      annotations: [],
      width: 0,
      height: 0
    });
    setLabelOffsets({});
    setError(null);
  }, []);

  const handleReset = () => {
    setImageState({
      original: null,
      processed: null,
      annotations: [],
      width: 0,
      height: 0
    });
    setLabelOffsets({});
    setEditPrompt("");
    setError(null);
  };
  
  const handleOffsetChange = (index: number, offset: {x: number, y: number}) => {
    setLabelOffsets(prev => ({
        ...prev,
        [index]: offset
    }));
  };

  const handleTextChange = (index: number, newText: string) => {
    setImageState(prev => {
        const newAnnotations = [...prev.annotations];
        newAnnotations[index] = { ...newAnnotations[index], translation: newText };
        return { ...prev, annotations: newAnnotations };
    });
  };

  const getMimeType = (dataUrl: string) => {
    const match = dataUrl.match(/^data:(.*);base64,/);
    return match ? match[1] : 'image/jpeg';
  };

  const processTranslation = async () => {
    if (!imageState.original) return;
    
    setLoading(true);
    setError(null);
    setLabelOffsets({}); // Reset offsets on new translation
    try {
      const rawBase64 = imageState.original.split(',')[1];
      const mimeType = getMimeType(imageState.original);
      const results = await translateImageText(rawBase64, mimeType);
      setImageState(prev => ({ ...prev, annotations: results }));
      
      if (results.length === 0) {
        setError("No English text detected to translate.");
      }
    } catch (err) {
      setError("Failed to process translation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const processEdit = async () => {
    if (!imageState.original || !editPrompt.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const rawBase64 = imageState.original.split(',')[1];
      const mimeType = getMimeType(imageState.original);
      const newImageRaw = await editImageWithPrompt(rawBase64, editPrompt, mimeType);
      setImageState(prev => ({ ...prev, processed: `data:image/jpeg;base64,${newImageRaw}` }));
    } catch (err) {
      setError("Failed to edit image. The model might not support this request.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!imageState.original) return;
    
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `lingualens-${mode === AppMode.TRANSLATE ? 'translated' : 'studio'}-${timestamp}.jpg`;

    // Studio Mode: Download processed image or original
    if (mode === AppMode.EDIT) {
        link.href = imageState.processed || imageState.original;
        link.click();
        return;
    }

    // Translate Mode: Composite annotations onto the image using Canvas
    if (mode === AppMode.TRANSLATE) {
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageState.original;
        
        // Wait for image to load
        await new Promise((resolve) => { img.onload = resolve; });
        
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Draw Annotations
        imageState.annotations.forEach((ann, i) => {
            const isIdentical = ann.original.trim() === ann.translation.trim();
            // Don't draw labels for identical text (numbers)
            if (isIdentical) return;

            const [ymin, xmin, ymax, xmax] = ann.box_2d;
            
            // Convert 1000-scale coordinates to pixel coordinates
            const x = (xmin / 1000) * canvas.width;
            const y = (ymin / 1000) * canvas.height;
            const w = ((xmax - xmin) / 1000) * canvas.width;
            const h = ((ymax - ymin) / 1000) * canvas.height;

            // 1. Draw Highlight Box (Blue outline)
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
            ctx.lineWidth = Math.max(2, canvas.width * 0.003);
            ctx.strokeRect(x, y, w, h);

            // 2. Draw Translation Label Adjacent with Offset
            
            // Font settings
            const fontSize = Math.max(16, Math.min(canvas.width * 0.025, 32));
            ctx.font = `bold ${fontSize}px sans-serif`;
            
            const text = ann.translation;
            const padding = fontSize * 0.6;
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const boxHeight = fontSize + padding;
            // Add extra width for the grip icon (approx)
            const boxWidth = textWidth + (padding * 2) + 10; 

            // Calculate Base Position (mirroring Overlay logic)
            const isNearBottom = ymax > 850;
            const centerX = x + (w / 2);
            
            let labelX = centerX - (boxWidth / 2);
            let labelY = isNearBottom ? y - boxHeight - 4 : y + h + 4;

            // Clamp horizontal (Base logic)
            if (xmin < 100) labelX = x;
            else if (xmax > 900) labelX = (x + w) - boxWidth;

            // Apply User Offset (converted from 1000-scale to canvas px)
            const offset = labelOffsets[i] || { x: 0, y: 0 };
            const pixelOffsetX = (offset.x / 1000) * canvas.width;
            const pixelOffsetY = (offset.y / 1000) * canvas.height;

            labelX += pixelOffsetX;
            labelY += pixelOffsetY;

            // Simple clamp to canvas bounds (optional, but good for cleanliness)
            // labelX = Math.max(0, Math.min(labelX, canvas.width - boxWidth));
            // labelY = Math.max(0, Math.min(labelY, canvas.height - boxHeight));

            // Draw Label Background (Dark Slate)
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(labelX, labelY, boxWidth, boxHeight);

            // Draw Text (White)
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            // Offset text slightly to account for the grip icon space we added in logic
            ctx.fillText(text, labelX + padding + 5, labelY + (boxHeight / 2));
        });

        // Convert to data URL and download
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">L</div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">LinguaLens <span className="text-blue-600">&</span> Studio</h1>
          </div>
          
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setMode(AppMode.TRANSLATE)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === AppMode.TRANSLATE 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <Languages size={16} />
                Translate
              </span>
            </button>
            <button
              onClick={() => setMode(AppMode.EDIT)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === AppMode.EDIT 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <Wand2 size={16} />
                Studio
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
            <X className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={() => setError(null)} className="ml-auto hover:text-red-900"><X size={16} /></button>
          </div>
        )}

        {/* Empty State / Uploader */}
        {!imageState.original ? (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
             <div className="text-center mb-8 max-w-xl">
                <h2 className="text-3xl font-bold text-slate-900 mb-3">
                  {mode === AppMode.TRANSLATE ? "Instant Visual Translation" : "Creative AI Image Editing"}
                </h2>
                <p className="text-slate-500">
                  {mode === AppMode.TRANSLATE 
                    ? "Upload an image containing English text. We'll detect it and overlay Chinese translations nearby." 
                    : "Upload an image and use natural language to transform it using the Gemini 2.5 Flash Image model."}
                </p>
             </div>
             <Uploader onFileSelect={handleImageSelect} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
            
            {/* Sidebar Controls */}
            <div className="lg:col-span-1 space-y-6 order-2 lg:order-1">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">
                    {mode === AppMode.TRANSLATE ? "Translation Controls" : "Studio Controls"}
                  </h3>
                  <button 
                    onClick={handleReset}
                    className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                </div>

                {mode === AppMode.TRANSLATE ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Detect English text and overlay simplified Chinese translations.
                    </p>
                    <div className="flex flex-col gap-3">
                        <Button 
                            onClick={processTranslation} 
                            isLoading={loading}
                            disabled={imageState.annotations.length > 0}
                            className="w-full"
                            variant="primary"
                            icon={<Languages size={18} />}
                        >
                            {imageState.annotations.length > 0 ? "Translation Complete" : "Translate Text"}
                        </Button>
                        
                        {imageState.annotations.length > 0 && (
                             <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-100 max-h-[300px] overflow-y-auto">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Detected Segments</h4>
                                <p className="text-xs text-slate-500 mb-2 italic">Drag labels to move, double-click or edit below to change text.</p>
                                <ul className="space-y-2">
                                    {imageState.annotations.map((ann, i) => (
                                        <li key={i} className="text-sm border-l-2 border-blue-400 pl-2">
                                            <div className="text-slate-500 text-xs mb-1">{ann.original}</div>
                                            <input 
                                              type="text" 
                                              value={ann.translation} 
                                              onChange={(e) => handleTextChange(i, e.target.value)}
                                              className="w-full bg-transparent border-b border-transparent hover:border-blue-300 focus:border-blue-500 focus:outline-none text-slate-800 font-medium py-0.5 transition-colors"
                                            />
                                        </li>
                                    ))}
                                </ul>
                             </div>
                        )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Describe how you want to change the image.
                    </p>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Prompt</label>
                        <textarea
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm min-h-[100px]"
                            placeholder="E.g., 'Add a vintage filter', 'Make it look like a sketch', 'Add a cat in the corner'"
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                        />
                    </div>
                    <Button 
                        onClick={processEdit} 
                        isLoading={loading}
                        disabled={!editPrompt.trim()}
                        className="w-full"
                        variant="secondary"
                        icon={<Wand2 size={18} />}
                    >
                        Generate Edit
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Image Preview Area */}
            <div className="lg:col-span-2 order-1 lg:order-2 flex flex-col gap-4">
              <div className="w-full bg-slate-200/50 rounded-xl border border-slate-200 overflow-hidden min-h-[400px] flex items-center justify-center relative p-4">
                
                {loading && (
                    <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                        <p className="text-blue-900 font-medium animate-pulse">Processing with Gemini...</p>
                    </div>
                )}

                {/* Translate Mode View */}
                {mode === AppMode.TRANSLATE && imageState.original && (
                   <AnnotationOverlay 
                      imageSrc={imageState.original} 
                      annotations={imageState.annotations}
                      offsets={labelOffsets}
                      onOffsetChange={handleOffsetChange}
                      onTextChange={handleTextChange}
                   />
                )}

                {/* Edit Mode View */}
                {mode === AppMode.EDIT && (
                    <div className="relative w-full max-w-4xl">
                        {imageState.processed ? (
                             <img src={imageState.processed} alt="Edited" className="w-full h-auto rounded-lg shadow-lg" />
                        ) : (
                             imageState.original && (
                                <img src={imageState.original} alt="Original" className="w-full h-auto rounded-lg shadow-sm opacity-90" />
                             )
                        )}
                    </div>
                )}
              </div>

              {/* Action Bar below Image */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div className="text-sm text-slate-500">
                    {mode === AppMode.EDIT && !imageState.processed 
                        ? <span className="flex items-center gap-2"><ImageIcon size={16}/> Previewing original image</span> 
                        : <span className="flex items-center gap-2 text-green-600 font-medium">Ready to download</span>
                    }
                  </div>
                  
                  <Button 
                    variant="outline" 
                    onClick={handleDownload}
                    icon={<Download size={16} />}
                  >
                    Download Image
                  </Button>
              </div>
              
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default App;