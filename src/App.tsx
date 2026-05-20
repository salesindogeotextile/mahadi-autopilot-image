/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Send, 
  Download, 
  Loader2, 
  Image as ImageIcon, 
  Layers, 
  Palette, 
  Type, 
  ChevronRight,
  RefreshCw,
  Info,
  Maximize2,
  Play,
  Pause,
  Clock,
  CloudUpload
} from 'lucide-react';
import axios from 'axios';
import { generatePrimaTexImage } from './services/gemini.ts';
import { ImagePromptInputs, GeneratedImage } from './types.ts';

const LOADING_MESSAGES = [
  "Membangun tekstur geosintetik...",
  "Mengatur pencahayaan studio...",
  "Menyelaraskan perspektif 45 derajat...",
  "Menambahkan elemen branding PrimaTex...",
  "Merender hasil resolusi tinggi...",
  "Memastikan struktur serat terlihat tajam...",
  "Menghaluskan depth of field..."
];

const COLOR_OPTIONS = ['White', 'Black', 'Gray', 'Green'];
const getRandomColor = () => COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)];

export default function App() {
  const [inputs, setInputs] = useState<ImagePromptInputs>(() => ({
    articleTitle: '',
    materialColor: 'White',
    overlayText: '',
    aspectRatio: '16:9'
  }));

  const [isLoading, setIsLoading] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto Pilot States
  const [isAutoPilotActive, setIsAutoPilotActive] = useState(false);
  const [autoPilotIntervalMins, setAutoPilotIntervalMins] = useState(5);
  const [sheetName, setSheetName] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [autoPilotStatus, setAutoPilotStatus] = useState<string | null>(null);
  const [isProcessingAutoPilot, setIsProcessingAutoPilot] = useState(false);
  const autoPilotTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const compressToWebP = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Failed to create canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, 1280, 720);
        const webpDataUrl = canvas.toDataURL('image/webp', 0.65);
        resolve(webpDataUrl);
      };
      img.onerror = () => reject(new Error("Failed to load image for compression"));
      img.src = dataUrl;
    });
  };

  const startGenerating = async (arg?: ImagePromptInputs | React.BaseSyntheticEvent) => {
    // If it's an event, it won't have articleTitle. Use inputs instead.
    const overrideInputs = (arg && 'articleTitle' in (arg as any)) ? (arg as ImagePromptInputs) : undefined;
    const currentInputs = overrideInputs || inputs;
    
    if (!currentInputs.articleTitle) {
      if (!isAutoPilotActive) setError("Project Name harus diisi.");
      return null;
    }

    // Ensure we have something for overlayText, fallback to articleTitle
    const finalInputs = {
      ...currentInputs,
      overlayText: currentInputs.overlayText || currentInputs.articleTitle
    };

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    const messageInterval = setInterval(() => {
      setCurrentMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    try {
      const result = await generatePrimaTexImage(finalInputs);
      const webpUrl = await compressToWebP(result.url);
      
      const newImage = {
        ...result,
        webpUrl,
        timestamp: Date.now()
      };
      setGeneratedImage(newImage);
      clearInterval(messageInterval);
      setIsLoading(false);
      return newImage;
    } catch (err: any) {
      let friendlyError = err.message || "Gagal membuat gambar.";
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        friendlyError = "Kuota API Habis atau Terlalu Cepat. Harap tunggu beberapa saat atau perpanjang jeda Auto Pilot.";
        if (isAutoPilotActive) {
          setAutoPilotStatus("Paused: Quota Limit (429)");
        }
      }
      setError(friendlyError);
      clearInterval(messageInterval);
      setIsLoading(false);
      return null;
    }
  };

  const runAutoPilotCycle = async () => {
    if (isProcessingAutoPilot || !sheetName) return;
    
    setIsProcessingAutoPilot(true);
    setAutoPilotStatus("Scanning queue...");
    let currentRowId: number | null = null;
    
    const gasUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL || "";
    
    try {
      // 1. Get from GAS
      const response = await axios.post(gasUrl, {
        module: 'image',
        action: 'getNext',
        sheetName
      }, {
        headers: { 'Content-Type': 'text/plain' } // GAS sometimes needs this to avoid CORS preflight issues with JSON
      });
      
      if (!response.data || !response.data.projectName) {
        throw new Error("No queued items found");
      }
      
      const { rowId, projectName, mainHeadline, wpUrl, wpUsername, wpPassword, baseTone, aspectRatio } = response.data;
      currentRowId = rowId;
      
      setAutoPilotStatus(`Processing: ${projectName}`);
      const newInputs = {
        ...inputs,
        articleTitle: projectName,
        overlayText: mainHeadline,
        materialColor: baseTone || inputs.materialColor,
        aspectRatio: aspectRatio || inputs.aspectRatio
      };
      setInputs(newInputs);

      const result = await startGenerating(newInputs);
      if (result && result.webpUrl) {
        setAutoPilotStatus("Generated. Uploading to WP...");
        
        // Update Status to Sheet
        await axios.post(gasUrl, {
          module: 'image',
          action: 'updateStatus',
          rowId,
          status: 'Generated Image',
          sheetName
        }, { headers: { 'Content-Type': 'text/plain' } });
        
        // Sanitize project name for filename
        const sanitizedFileName = projectName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        // Upload to WordPress directly from client
        const finalWpUrl = wpUrl || import.meta.env.VITE_WP_URL;
        const finalWpUsername = wpUsername || import.meta.env.VITE_WP_USERNAME;
        const finalWpPassword = wpPassword || import.meta.env.VITE_WP_PASSWORD;

        if (!finalWpUrl || !finalWpUsername || !finalWpPassword) {
            throw new Error("WordPress credentials missing (not in sheet and not in environment variables)");
        }

        const base64Data = result.webpUrl.replace(/^data:image\/webp;base64,/, "");
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/webp' });

        const formData = new FormData();
        formData.append('file', blob, `${sanitizedFileName}.webp`);
        formData.append('title', projectName);
        formData.append('alt_text', projectName);

        let targetUrl = finalWpUrl.replace(/\/$/, '');
        if (!targetUrl.includes('/wp-json')) targetUrl += '/wp-json/wp/v2/media';
        else if (!targetUrl.endsWith('/wp/v2/media')) targetUrl += '/wp/v2/media';

        const wpResponse = await axios.post(targetUrl, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Basic ${btoa(`${finalWpUsername}:${finalWpPassword}`)}`
          }
        });

        if (wpResponse.data && wpResponse.data.source_url) {
          setAutoPilotStatus("Success! Published.");
          await axios.post(gasUrl, {
            module: 'image',
            action: 'updateStatus',
            rowId,
            status: 'Finished',
            sheetName
          }, { headers: { 'Content-Type': 'text/plain' } });
        } else {
          throw new Error("WordPress upload failed");
        }
      } else {
        throw new Error("Image generation failed");
      }
    } catch (err: any) {
      if (err.message === "No queued items found") {
        setAutoPilotStatus("Queue Empty.");
      } else {
        let errorMessage = err.message || "Unknown error";
        if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        }
        
        setAutoPilotStatus(`Error: ${errorMessage}`);
        
        if (currentRowId) {
          try {
            await axios.post(gasUrl, { 
              module: 'image',
              action: 'updateStatus',
              rowId: currentRowId, 
              status: "Error",
              sheetName
            }, { headers: { 'Content-Type': 'text/plain' } });
          } catch (statusErr) {
            console.error("Failed to update error status to sheet", statusErr);
          }
        }
      }
    } finally {
      setIsProcessingAutoPilot(false);
      setCountdown(autoPilotIntervalMins * 60);
    }
  };

  // Sync interval value with a ref for the timer closure
  const intervalRef = useRef(autoPilotIntervalMins);
  useEffect(() => {
    intervalRef.current = autoPilotIntervalMins;
  }, [autoPilotIntervalMins]);

  const isProcessingRef = useRef(false);
  useEffect(() => {
    isProcessingRef.current = isProcessingAutoPilot;
  }, [isProcessingAutoPilot]);

  useEffect(() => {
    if (isAutoPilotActive) {
      // Start immediately the first time
      runAutoPilotCycle();
      
      countdownTimerRef.current = setInterval(() => {
        // ONLY decrement if NOT currently processing a task
        if (!isProcessingRef.current) {
          setCountdown(prev => {
            if (prev <= 1) {
              runAutoPilotCycle();
              return intervalRef.current * 60;
            }
            return prev - 1;
          });
        }
      }, 1000);
    } else {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setAutoPilotStatus(null);
      setCountdown(0);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isAutoPilotActive]); // REMOVED autoPilotIntervalMins from dependencies

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimeJakarta = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    }).replace(/:/g, '.');
  };

  const formatDateJakarta = (date: Date) => {
    const day = date.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
    const formattedDate = date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
    return `${day}, ${formattedDate}`;
  };

  const downloadImage = (type: 'raw' | 'webp' = 'raw') => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = type === 'webp' && generatedImage.webpUrl ? generatedImage.webpUrl : generatedImage.url;
    const extension = type === 'webp' ? 'webp' : 'png';
    const fileName = (inputs.articleTitle || inputs.overlayText || 'PrimaTex_Asset').replace(/\s+/g, '_');
    link.download = `${fileName}_${type.toUpperCase()}_${Date.now()}.${extension}`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-blue-600/30 relative overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-slate-700/20 blur-[100px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="bg-slate-900/60 border-b border-slate-700/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-xl text-slate-100 uppercase">AutoPilot <span className="text-blue-400 font-light italic capitalize tracking-normal">Image</span> <span className="text-red-600 font-black italic ml-1">Mahadi - Indo</span></span>
              <span className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-bold ml-0.5">Industrial Engine</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden md:flex flex-col items-end gap-0.5 pointer-events-none pr-4 border-r border-slate-700/30">
               <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">WIB (JAKARTA)</span>
               <div className="flex items-baseline gap-2">
                 <span className="text-xl font-mono font-bold text-slate-200 tabular-nums">
                   {formatTimeJakarta(currentTime)}
                 </span>
                 <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                   {formatDateJakarta(currentTime)}
                 </span>
               </div>
             </div>

             <div className="hidden sm:flex px-3 py-1 bg-slate-800/80 rounded border border-slate-700/50 text-[10px] items-center gap-2 font-mono text-slate-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
              GPU RENDER ACTIVE
            </div>
            <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-all shadow-lg shadow-blue-900/20 active:scale-95">
              Export
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Form Side */}
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-6">
              {/* Project Name (Reference) */}
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center gap-2">
                  <Info size={12} className="text-blue-500" />
                  Project Name (Internal Reference)
                </label>
                <input 
                  type="text"
                  name="articleTitle"
                  value={inputs.articleTitle}
                  onChange={handleInputChange}
                  placeholder="E.g. Catalog Sep 2026"
                  className="w-full bg-slate-950/40 border border-slate-700/50 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-700 text-slate-200 transition-colors"
                />
              </div>


              {/* Color & Aspect */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center gap-2">
                    <Palette size={12} className="text-blue-500" />
                    Base Tone
                  </label>
                  <select 
                    name="materialColor"
                    value={inputs.materialColor}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/40 border border-slate-700/50 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 text-slate-200"
                  >
                    <option className="bg-[#0f172a]" value="White">White</option>
                    <option className="bg-[#0f172a]" value="Black">Black</option>
                    <option className="bg-[#0f172a]" value="Gray">Gray</option>
                    <option className="bg-[#0f172a]" value="Green">Green</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center gap-2">
                    <Maximize2 size={12} className="text-blue-500" />
                    Ratio
                  </label>
                  <select 
                    name="aspectRatio"
                    value={inputs.aspectRatio}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/40 border border-slate-700/50 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 text-slate-200"
                  >
                    <option className="bg-[#0f172a]" value="16:9">16 : 9</option>
                    <option className="bg-[#0f172a]" value="1:1">1 : 1</option>
                    <option className="bg-[#0f172a]" value="9:16">9 : 16</option>
                    <option className="bg-[#0f172a]" value="4:3">4 : 3</option>
                    <option className="bg-[#0f172a]" value="3:4">3 : 4</option>
                  </select>
                </div>
              </div>

              {/* Headline Text */}
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500 flex items-center gap-2">
                  <Send size={12} className="text-blue-500" />
                  Main Headline
                </label>
                <input 
                  type="text"
                  name="overlayText"
                  value={inputs.overlayText}
                  onChange={handleInputChange}
                  placeholder="E.g. PANDUAN LENGKAP PRODUK"
                  className="w-full bg-slate-950/40 border border-slate-700/50 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-700 text-slate-200 transition-colors"
                />
              </div>

              {/* Generate Button */}
              <button
                onClick={startGenerating}
                disabled={isLoading}
                className={`w-full py-4 rounded-lg flex items-center justify-center gap-3 font-bold text-sm uppercase tracking-widest transition-all ${
                  isLoading 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50' 
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl shadow-blue-900/20 active:scale-[0.98]'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Camera size={18} />
                    <span>Regenerate</span>
                  </>
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-900/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex gap-3 font-medium">
                  <Info size={16} className="shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {/* Auto Pilot Controller */}
              <div className="p-5 bg-slate-900/80 border border-slate-700/50 rounded-xl space-y-4 shadow-2xl mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className={`text-blue-400 ${isAutoPilotActive ? 'animate-spin' : ''}`} />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-300">Konfigurasi Auto Pilot</span>
                  </div>
                  {isAutoPilotActive && (
                    <div className={`px-2 py-0.5 border rounded text-[9px] font-bold flex items-center gap-1.5 ${
                      isProcessingAutoPilot 
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                      : 'bg-green-500/10 border-green-500/20 text-green-400'
                    }`}>
                      <div className={`w-1 h-1 rounded-full animate-pulse ${isProcessingAutoPilot ? 'bg-blue-400' : 'bg-green-400'}`}></div>
                      {isProcessingAutoPilot ? 'PROCESSING' : 'RUNNING'}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Nama Sheet</label>
                  <input 
                    type="text"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="contoh: Geotextile"
                    className="w-full bg-slate-950/20 border border-slate-700/50 rounded p-2 text-xs focus:outline-none focus:border-blue-500 placeholder:text-slate-700"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 20, 30].map(m => (
                    <button
                      key={m}
                      onClick={() => setAutoPilotIntervalMins(m)}
                      className={`py-2 rounded text-[11px] font-bold transition-all border ${
                        autoPilotIntervalMins === m 
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-900/20' 
                        : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsAutoPilotActive(!isAutoPilotActive)}
                  disabled={!sheetName && !isAutoPilotActive}
                  className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all ${
                    isAutoPilotActive 
                    ? 'bg-red-600/10 border border-red-500/50 text-red-500 hover:bg-red-600/20' 
                    : (!sheetName 
                       ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/30' 
                       : 'bg-white text-slate-950 shadow-xl shadow-white/5 hover:bg-slate-100 active:scale-[0.98]')
                  }`}
                >
                  {isAutoPilotActive ? (
                    <>
                      <Pause size={14} fill="currentColor" />
                      Stop Auto Pilot
                    </>
                  ) : (
                    <>
                      <Play size={14} fill="currentColor" />
                      Start Auto Pilot
                    </>
                  )}
                </button>

                <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between">
                   <div className="flex flex-col gap-1">
                     <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Scaning Status</span>
                     <span className="text-[10px] text-blue-300 font-medium">{autoPilotStatus || 'Idle'}</span>
                   </div>
                   {isAutoPilotActive && (
                     <div className="flex flex-col items-end gap-1">
                       <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Next Scan</span>
                       <div className="flex items-center gap-1.5 text-slate-100 font-mono text-[11px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          <Clock size={10} className="text-blue-500" />
                          {formatTime(countdown)}
                       </div>
                     </div>
                   )}
                </div>
                
                <p className="text-[9px] text-slate-600 text-center uppercase tracking-tight">
                  Klik start untuk scan baris dengan status Published atau Published Pillar.
                </p>
              </div>
            </div>
            
            <div className="p-5 bg-blue-900/10 rounded-xl border border-blue-500/20">
              <div className="flex items-start gap-3">
                <Info className="text-blue-400 mt-0.5" size={16} />
                <p className="text-[11px] text-blue-300 leading-relaxed font-medium">
                  Realistic Rendering active. Output set to 45° Fixed Perspective with Studio Soft lighting presets.
                </p>
              </div>
            </div>
          </div>

          {/* Result Side */}
          <div className="lg:col-span-8">
            <div className="sticky top-24 space-y-8">
              <div className="relative aspect-video bg-slate-950 rounded-lg border border-slate-800 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden group">
                {/* Visual Grid Overlay */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-0 group-hover:opacity-10 transition-opacity z-20">
                   <div className="border-r border-b border-white/50"></div><div className="border-r border-b border-white/50"></div><div className="border-b border-white/50"></div>
                   <div className="border-r border-b border-white/50"></div><div className="border-r border-b border-white/50"></div><div className="border-b border-white/50"></div>
                   <div className="border-r border-white/50"></div><div className="border-r border-white/50"></div><div></div>
                </div>

                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md z-30 p-12 text-center"
                    >
                      <Loader2 size={40} className="text-blue-500 animate-spin mb-6" />
                      <div className="space-y-3">
                        <motion.p 
                          key={currentMessageIndex}
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -10, opacity: 0 }}
                          className="text-lg font-bold text-slate-100 uppercase tracking-widest"
                        >
                          {LOADING_MESSAGES[currentMessageIndex]}
                        </motion.p>
                        <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden">
                           <motion.div 
                            className="h-full bg-blue-500"
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 15, ease: "linear" }}
                           />
                        </div>
                      </div>
                    </motion.div>
                  ) : generatedImage ? (
                    <motion.div 
                      key="image"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 z-10"
                    >
                      <img 
                        src={generatedImage.url} 
                        alt="Generated Asset" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-blue-950/0 group-hover:bg-blue-950/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <button 
                          onClick={() => downloadImage('raw')}
                          className="bg-white text-black px-8 py-3 rounded font-bold flex items-center gap-2 shadow-2xl hover:scale-105 transition-transform"
                        >
                          <Download size={18} />
                          DOWNLOAD RAW
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="placeholder"
                      className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 p-12 text-center"
                    >
                      <div className="w-16 h-16 border border-slate-800 bg-slate-900/30 rounded flex items-center justify-center mb-6">
                        <ImageIcon size={32} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Awaiting Visual Command</h3>
                      <p className="max-w-[200px] mt-3 text-[11px] text-slate-600 font-medium">
                        INDUSTRIAL QUALITY RENDER WILL APPEAR HERE.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Metadata Bar */}
              <div className="flex flex-wrap gap-8 justify-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                <div className="flex gap-2"><span>RES:</span><span className="text-slate-300">3840 x 2160</span></div>
                <div className="flex gap-2"><span>CAM:</span><span className="text-slate-300">45° FIXED</span></div>
                <div className="flex gap-2"><span>TYPE:</span><span className="text-slate-300">INDUSTRIAL-RAW</span></div>
              </div>

              {generatedImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                         <RefreshCw size={12} className="text-blue-500" />
                         Engine Prompt Trace
                      </h4>
                      <div className="text-[9px] text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        VERIFIED BY PRIMATEX
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 leading-relaxed opacity-60 max-h-32 overflow-y-auto custom-scrollbar pr-4">
                      {generatedImage.prompt}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => downloadImage('raw')}
                        className="flex items-center justify-center gap-2 py-4 bg-slate-800/50 border border-slate-700 text-slate-200 text-xs font-bold uppercase tracking-widest rounded hover:bg-slate-700 transition-all"
                      >
                        <Download size={16} />
                        RAW PNG (1K)
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                       <button 
                        onClick={() => downloadImage('webp')}
                        className="flex items-center justify-center gap-2 py-4 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                      >
                        <Download size={16} />
                        WEBP (720p)
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <button 
                      onClick={() => setGeneratedImage(null)}
                      className="text-[10px] text-slate-500 hover:text-blue-400 font-bold uppercase tracking-[0.2em] transition-colors"
                    >
                      &mdash; New Session &mdash;
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="mt-auto h-12 bg-slate-900/80 border-t border-slate-800/50 backdrop-blur-md flex items-center justify-between px-8 text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span>Server:</span>
            <span className="text-blue-400">PRX-INDUSTRIAL-01</span>
          </div>
          <span className="text-slate-800 font-normal">|</span>
          <div className="flex items-center gap-2">
            <span>Status:</span>
            <span className="text-slate-300">System Ready</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[9px]">Engine Load</span>
            <div className="w-32 h-1 bg-slate-800 rounded-full relative overflow-hidden">
              <motion.div 
                className="absolute inset-y-0 left-0 bg-blue-500"
                initial={{ width: "2%" }}
                animate={{ width: isLoading ? "85%" : "12%" }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
          <span className="text-slate-400">&copy; 2026 PT PRIMATEX</span>
        </div>
      </footer>
    </div>

  );
}
