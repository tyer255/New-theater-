/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CatalogModal } from './components/CatalogModal';
import { Joystick } from './components/Joystick';
import { PartyWidget } from './components/PartyWidget';
import { MediaType } from './services/catalog';
import { CinemaEngine, EngineUIState } from './theatre/engine';

function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  return coarse || (navigator.maxTouchPoints > 0 && !fine);
}

interface ActiveMedia {
  url: string;
  title: string;
  type: MediaType;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CinemaEngine | null>(null);

  const [isMobile] = useState(detectCoarsePointer);
  const [uiState, setUiState] = useState<EngineUIState>({
    nearSeat: null,
    seated: false,
    busy: false,
    seatLabel: null,
    streaming: false,
    playerStatus: 'idle',
    focused: false,
  });

  const [stage, setStage] = useState<'intro' | 'leaving' | 'play'>('intro');
  const [muted, setMuted] = useState(false);
  const [hasEverSat, setHasEverSat] = useState(false);
  const [showSeatToast, setShowSeatToast] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeMedia, setActiveMedia] = useState<ActiveMedia | null>(null);
  const [playerInteractive, setPlayerInteractive] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [hideInterface, setHideInterface] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fullscreenSupported =
    typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const smallScreen = Math.min(window.screen.width, window.screen.height) < 820;
    const engine = new CinemaEngine(container, {
      mobile: isMobile || smallScreen,
      onState: setUiState,
    });
    engineRef.current = engine;
    (window as any).__cinema = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' || params.get('play') === '1') {
      engine.enter();
      setStage('play');
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [isMobile]);

  useEffect(() => {
    if (uiState.seated) {
      setHasEverSat(true);
    }
  }, [uiState.seated]);

  useEffect(() => {
    if (!uiState.seated || !uiState.seatLabel) {
      setShowSeatToast(false);
      return;
    }
    setShowSeatToast(true);
    const id = window.setTimeout(() => setShowSeatToast(false), 4000);
    return () => window.clearTimeout(id);
  }, [uiState.seated, uiState.seatLabel]);

  useEffect(() => {
    engineRef.current?.setPaused(catalogOpen);
  }, [catalogOpen]);

  useEffect(() => {
    setScreenFocused(uiState.focused);
  }, [uiState.focused]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleEnterTheatre = useCallback(() => {
    if (stage !== 'intro') return;
    engineRef.current?.enter();
    engineRef.current?.setMuted(muted);
    setStage('leaving');
    window.setTimeout(() => setStage('play'), 800);
  }, [stage, muted]);

  useEffect(() => {
    if (stage !== 'intro') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleEnterTheatre();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, handleEnterTheatre]);

  useEffect(() => {
    if (stage !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '/' || e.code === 'KeyK') {
        e.preventDefault();
        setCatalogOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  const handleJoystickChange = useCallback((x: number, y: number) => {
    engineRef.current?.setJoystick(x, y);
  }, []);

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
    e.currentTarget.blur();
  };

  const handleToggleFullscreen = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {}
  };

  const handleToggleSit = (e: React.MouseEvent<HTMLButtonElement>) => {
    engineRef.current?.toggleSit();
    e.currentTarget.blur();
  };

  const handlePlayMedia = (url: string, title: string, type: MediaType) => {
    setCatalogOpen(false);
    engineRef.current?.ensureSeated();
    setActiveMedia({ url, title, type });
    engineRef.current?.playOnScreen(url, { title });
  };

  const handleStopMedia = () => {
    setActiveMedia(null);
    setPlayerInteractive(false);
    setScreenFocused(false);
    engineRef.current?.playOnScreen(null);
    engineRef.current?.setPlayerInteractive(false);
    engineRef.current?.setScreenFocus(false);
  };

  const handleToggleFocus = () => {
    const next = !screenFocused;
    setScreenFocused(next);
    engineRef.current?.setScreenFocus(next);
  };

  const handleToggleInteractive = () => {
    const next = !playerInteractive;
    setPlayerInteractive(next);
    engineRef.current?.setPlayerInteractive(next);
  };

  const inTheatre = stage !== 'intro';
  const canSit = Boolean(uiState.nearSeat) && !uiState.seated && !uiState.busy;
  const showSitButton = inTheatre && (canSit || uiState.seated);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-sans text-white select-none">
      {/* Three.js & CSS3D Container */}
      <div ref={containerRef} id="canvas-container" className="absolute inset-0" />

      {/* Vignette Overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />

      {/* Watch Party Widget */}
      <PartyWidget />

      {/* In-Theatre HUD */}
      {inTheatre && !catalogOpen && !playerInteractive && !hideInterface && (
        <div className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300">
          {/* Top-Left Brand + Now Showing */}
          <div
            className={`absolute top-4 left-4 flex items-center gap-3 transition-opacity duration-700 sm:top-5 sm:left-6 ${
              uiState.seated ? 'opacity-40' : 'opacity-100'
            }`}
          >
            <div className="text-[13px] font-semibold tracking-[0.42em] text-white/90 sm:text-sm">
              AETHOFLIX
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] tracking-[0.22em] text-white/70 backdrop-blur-md md:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              {activeMedia
                ? activeMedia.title.toUpperCase().slice(0, 34)
                : 'NOW SHOWING · A BIGGER WORLD'}
            </div>
          </div>

          {/* Top-Right Controls: Search, Zoom, Mute, Fullscreen, Hide UI */}
          <div className="pointer-events-auto absolute top-4 right-4 flex gap-2 sm:top-5 sm:right-6">
            <button
              id="catalog-btn"
              onClick={(e) => {
                setCatalogOpen(true);
                e.currentTarget.blur();
              }}
              aria-label="Search movies, shows and live TV"
              className="flex h-10 items-center gap-2 rounded-full border border-amber-200/30 bg-amber-300/15 px-3.5 text-amber-100 backdrop-blur-md transition hover:bg-amber-300/25 active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4.5 w-4.5"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="hidden text-sm font-medium sm:inline">Search</span>
            </button>

            {activeMedia && (
              <button
                onClick={handleToggleFocus}
                aria-label={screenFocused ? 'Theatre view' : 'Zoom into the screen'}
                title={screenFocused ? 'Theatre view' : 'Zoom into the screen'}
                className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md transition active:scale-95 ${
                  screenFocused
                    ? 'border-amber-300 bg-amber-300 text-black'
                    : 'border-white/15 bg-black/40 text-white/85 hover:bg-white/10'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M2.5 6.5Q12 3.5 21.5 6.5v9Q12 12.5 2.5 15.5z" />
                  <path d="M8 20h8" />
                </svg>
              </button>
            )}

            <button
              id="mute-btn"
              onClick={handleToggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/40 text-white/85 backdrop-blur-md transition hover:bg-white/10 active:scale-95"
            >
              {muted ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="m16 9 6 6M22 9l-6 6" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
            </button>

            {fullscreenSupported && (
              <button
                onClick={handleToggleFullscreen}
                aria-label="Toggle fullscreen"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/40 text-white/85 backdrop-blur-md transition hover:bg-white/10 active:scale-95"
              >
                {isFullscreen ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                )}
              </button>
            )}

            <button
              onClick={(e) => {
                setHideInterface((v) => !v);
                e.currentTarget.blur();
              }}
              aria-label="Hide interface"
              title="Hide interface"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/40 text-white/85 backdrop-blur-md transition hover:bg-white/10 active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>

          {/* Center-Top Guidance Pill / Seat Toast */}
          <div className="absolute top-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 sm:top-20">
            {showSeatToast && uiState.seatLabel && (
              <div className="fade-up rounded-full border border-amber-200/20 bg-black/50 px-4 py-2 text-center text-xs text-white/85 backdrop-blur-md sm:text-sm">
                <span className="font-semibold text-amber-200">{uiState.seatLabel}</span>
                <span className="mx-2 text-white/30">|</span>
                Enjoy the show 🍿
              </div>
            )}

            {!uiState.seated && !uiState.busy && !uiState.nearSeat && !hasEverSat && (
              <div className="fade-up rounded-full border border-white/10 bg-black/45 px-4 py-2 text-center text-xs text-white/75 backdrop-blur-md sm:text-sm">
                Walk up to any seat and press{' '}
                <span className="font-semibold text-amber-300">Sit</span>
              </div>
            )}
          </div>

          {/* Bottom-Left Controls or Mobile Joystick */}
          {isMobile ? (
            <div
              className={`transition-opacity duration-500 ${
                uiState.seated || uiState.busy ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
            >
              <Joystick onChange={handleJoystickChange} />
            </div>
          ) : (
            <div
              className={`absolute bottom-6 left-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-white/70 backdrop-blur-md transition-opacity duration-700 ${
                uiState.seated ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="grid grid-cols-3 gap-1">
                  <span />
                  <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-white/25 bg-white/10 px-1 text-[11px] font-semibold text-white/90">
                    W
                  </kbd>
                  <span />
                  <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-white/25 bg-white/10 px-1 text-[11px] font-semibold text-white/90">
                    A
                  </kbd>
                  <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-white/25 bg-white/10 px-1 text-[11px] font-semibold text-white/90">
                    S
                  </kbd>
                  <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-white/25 bg-white/10 px-1 text-[11px] font-semibold text-white/90">
                    D
                  </kbd>
                </div>
                <div className="space-y-1 leading-tight">
                  <div>
                    <span className="text-white/90">Move</span> · Shift to run
                  </div>
                  <div>
                    <span className="text-white/90">Drag</span> to look · Scroll zoom
                  </div>
                  <div>
                    <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-white/25 bg-white/10 px-1 text-[11px] font-semibold text-white/90">
                      E
                    </kbd>{' '}
                    <span className="text-white/90">Sit / Stand</span> ·{' '}
                    <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-white/25 bg-white/10 px-1 text-[11px] font-semibold text-white/90">
                      /
                    </kbd>{' '}
                    <span className="text-white/90">Search</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom-Right Sit / Stand Circular Action Button */}
          <div
            className={`absolute right-5 bottom-6 transition-all duration-300 sm:right-8 sm:bottom-8 ${
              showSitButton && !activeMedia
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-6 opacity-0'
            }`}
          >
            <button
              id="sit-btn"
              onClick={handleToggleSit}
              disabled={!showSitButton}
              className="pointer-events-auto flex flex-col items-center gap-1.5 outline-none"
            >
              {uiState.seated ? (
                <span className="grid h-[76px] w-[76px] place-items-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition active:scale-95 sm:h-20 sm:w-20">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-8 w-8"
                  >
                    <circle cx="12" cy="4.5" r="2" />
                    <path d="M12 8v7M12 15l-3 6M12 15l3 6M8 11l4-3 4 3" />
                  </svg>
                </span>
              ) : (
                <span className="sit-pulse grid h-[76px] w-[76px] place-items-center rounded-full bg-gradient-to-b from-amber-300 to-orange-600 text-black shadow-[0_0_40px_rgba(255,150,50,0.5)] ring-1 ring-white/40 transition active:scale-95 sm:h-20 sm:w-20">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-8 w-8"
                  >
                    <path d="M6 11V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V11" />
                    <path d="M4 11.5a1.5 1.5 0 0 1 3 0V14h10v-2.5a1.5 1.5 0 0 1 3 0V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                    <path d="M6.5 18v2M17.5 18v2" />
                  </svg>
                </span>
              )}
              <span className="text-sm font-semibold tracking-wide drop-shadow">
                {uiState.seated ? 'Stand Up' : 'Sit'}
                {!isMobile && (
                  <span className="ml-1.5 rounded border border-white/25 px-1 text-[10px] text-white/60">
                    E
                  </span>
                )}
              </span>
              {!uiState.seated && uiState.nearSeat && (
                <span className="text-[11px] text-white/60">{uiState.nearSeat}</span>
              )}
            </button>
          </div>

          {/* Active Media Control Pill (Top-Left under brand) */}
          {activeMedia && (
            <div className="pointer-events-auto absolute top-16 left-4 flex items-center gap-2 rounded-xl border border-white/12 bg-black/65 px-3 py-2 backdrop-blur-md sm:top-[4.5rem] sm:left-6">
              <div className="min-w-0">
                <div className="max-w-[180px] truncate text-xs font-semibold text-white">
                  {activeMedia.title}
                </div>
                <div className="text-[10px] text-white/50">
                  {uiState.playerStatus === 'loading' ? 'Loading feed…' : 'Playing on IMAX Screen'}
                </div>
              </div>
              <button
                onClick={handleToggleInteractive}
                className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20"
              >
                {playerInteractive ? 'Lock Screen' : 'Tap Screen'}
              </button>
              <button
                onClick={handleStopMedia}
                className="rounded-lg border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/30"
              >
                Stop
              </button>
            </div>
          )}
        </div>
      )}

      {/* Restore Hidden Interface Button */}
      {inTheatre && !catalogOpen && hideInterface && (
        <button
          onClick={() => setHideInterface(false)}
          aria-label="Show interface"
          className="absolute top-4 right-4 z-30 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/60 text-white/90 backdrop-blur-md transition hover:bg-black/90"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 5.9A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6.6 6.9A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1" />
          </svg>
        </button>
      )}

      {/* Interactive Player Floating Controls */}
      {inTheatre && playerInteractive && !hideInterface && (
        <div className="absolute top-4 right-4 z-30 flex gap-2">
          <button
            onClick={handleToggleFocus}
            className="flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-3.5 py-2 text-sm text-white backdrop-blur-md transition hover:bg-black/90"
          >
            {screenFocused ? 'Room' : 'Big'}
          </button>
          <button
            onClick={handleToggleInteractive}
            className="flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur-md transition hover:bg-black/90"
          >
            Done
          </button>
        </div>
      )}

      {/* Catalog Modal */}
      <CatalogModal
        open={inTheatre && catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onPlayMedia={handlePlayMedia}
        onResumeShader={handleStopMedia}
        isPlayingUrl={Boolean(activeMedia)}
      />

      {/* Intro Landing Overlay — Exact 1:1 Replica of https://theatre.aethoflix.world/ */}
      {stage !== 'play' && (
        <div
          id="intro-overlay"
          className={`absolute inset-0 z-20 transition-opacity duration-700 ${
            stage === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/50" />

          <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-5 sm:px-12 sm:pt-8">
            <div className="text-base font-semibold tracking-[0.45em] sm:text-xl">AETHOFLIX</div>
            <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/30 px-4 py-1.5 text-[11px] tracking-[0.25em] text-white/70 backdrop-blur sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> NOW SHOWING
            </div>
          </header>

          <main className="absolute top-1/2 left-6 max-w-xl -translate-y-1/2 pr-6 sm:left-12">
            <p className="fade-up mb-3 text-[10px] tracking-[0.5em] text-white/60 sm:mb-4 sm:text-xs">
              VIRTUAL IMAX CINEMA
            </p>
            <h1
              className="fade-up bg-gradient-to-b from-white to-white/55 bg-clip-text text-5xl leading-[0.95] font-medium text-transparent sm:text-7xl [@media(max-height:480px)]:text-4xl"
              style={{ animationDelay: '80ms' }}
            >
              A Bigger
              <br />
              World
            </h1>
            <p
              className="fade-up mt-4 max-w-sm text-sm text-white/75 sm:mt-5 sm:text-base [@media(max-height:480px)]:mt-2 [@media(max-height:480px)]:text-xs"
              style={{ animationDelay: '160ms' }}
            >
              Walk around, find your seat, then search any movie, show or live channel and watch it
              on the giant curved screen.
            </p>
            <button
              id="start-btn"
              onClick={handleEnterTheatre}
              className="fade-up group mt-7 inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/10 py-2 pr-6 pl-2 backdrop-blur-md transition hover:border-white/40 hover:bg-white/15 active:scale-[0.98] [@media(max-height:480px)]:mt-4"
              style={{ animationDelay: '240ms' }}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4 w-4">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
                </svg>
              </span>
              <span className="text-base font-medium">Enter Theatre</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition group-hover:translate-x-1"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </main>

          <footer className="absolute inset-x-0 bottom-0 flex gap-6 px-6 pb-6 text-white/85 sm:gap-12 sm:px-12 sm:pb-9 [@media(max-height:480px)]:hidden">
            <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-white/80">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M6 11V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V11" />
                  <path d="M4 11.5a1.5 1.5 0 0 1 3 0V14h10v-2.5a1.5 1.5 0 0 1 3 0V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                  <path d="M6.5 18v2M17.5 18v2" />
                </svg>
              </span>
              <div>
                <div className="text-xs font-medium sm:text-sm">10 Premium Seats</div>
                <div className="text-[10px] text-white/50 sm:text-xs">2 rows × 5 seats</div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-white/80">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M2.5 6.5Q12 3.5 21.5 6.5v9Q12 12.5 2.5 15.5z" />
                  <path d="M8 20h8" />
                </svg>
              </span>
              <div>
                <div className="text-xs font-medium sm:text-sm">Giant IMAX Screen</div>
                <div className="text-[10px] text-white/50 sm:text-xs">Movies · Shows · Live TV</div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-white/80">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <circle cx="13" cy="4" r="1.8" />
                  <path d="m9 21 2.5-6 2.5 2v4M11.5 15 12 9l-3 2-1.5 3M12 9l3.5 2.5L18 11" />
                </svg>
              </span>
              <div>
                <div className="text-xs font-medium sm:text-sm">Free Exploration</div>
                <div className="text-[10px] text-white/50 sm:text-xs">
                  {isMobile ? 'Joystick + Sit' : 'WASD + Sit'}
                </div>
              </div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
