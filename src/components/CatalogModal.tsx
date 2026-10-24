/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EpisodeInfo,
  getDetails,
  getEmbedUrl,
  getSeasonEpisodes,
  getServers,
  getTrending,
  MediaDetails,
  MediaItem,
  MediaType,
  searchCatalog,
} from '../services/catalog';

interface CatalogModalProps {
  open: boolean;
  onClose: () => void;
  onPlayMedia: (url: string, title: string, type: MediaType) => void;
  onResumeShader: () => void;
  isPlayingUrl: boolean;
}

export const CatalogModal: React.FC<CatalogModalProps> = ({
  open,
  onClose,
  onPlayMedia,
  onResumeShader,
  isPlayingUrl,
}) => {
  const [activeType, setActiveType] = useState<MediaType>('movie');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [selectedServer, setSelectedServer] = useState('vidlink');
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [isDub, setIsDub] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const results = query.trim()
        ? await searchCatalog(query, activeType, 1)
        : await getTrending(activeType, 1);
      if (!cancelled) {
        setItems(results);
        setLoading(false);
      }
    }, query.trim() ? 280 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, activeType, query]);

  useEffect(() => {
    if (!selectedItem) {
      setDetails(null);
      setEpisodes([]);
      return;
    }
    const servers = getServers(selectedItem.type);
    setSelectedServer(servers[0]?.id || 'vidlink');
    setSelectedSeason(1);
    setSelectedEpisode(1);

    let cancelled = false;
    getDetails(selectedItem.id, selectedItem.type).then((d) => {
      if (!cancelled) setDetails(d);
    });
    if (selectedItem.type === 'tv') {
      getSeasonEpisodes(selectedItem.id, 1).then((eps) => {
        if (!cancelled) setEpisodes(eps);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem || selectedItem.type !== 'tv') return;
    let cancelled = false;
    getSeasonEpisodes(selectedItem.id, selectedSeason).then((eps) => {
      if (!cancelled) setEpisodes(eps);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedItem, selectedSeason]);

  if (!open) return null;

  const handlePlay = (serverOverride?: string) => {
    if (!selectedItem) return;
    const srv = serverOverride || selectedServer;
    const url = getEmbedUrl(
      selectedItem.type,
      selectedItem.id,
      srv,
      selectedSeason,
      selectedEpisode,
      isDub
    );
    let label = selectedItem.title;
    if (selectedItem.type === 'tv') {
      label += ` · S${selectedSeason}E${selectedEpisode}`;
    } else if (selectedItem.type === 'anime') {
      label += ` · Ep ${selectedEpisode} (${isDub ? 'DUB' : 'SUB'})`;
    }
    onPlayMedia(url, label, selectedItem.type);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#06060c]/[0.96] backdrop-blur-2xl animate-[fade-up_0.25s_ease_both]">
      {!selectedItem ? (
        <>
          {/* Top Bar */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-4 border-b border-white/[0.06] px-6 py-5">
            <div className="flex items-center gap-2.5 text-lg font-bold text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff3c3c" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              <span>IMAX Catalog</span>
            </div>

            <div className="relative min-w-[220px] flex-1">
              <svg
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-white/30"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies, series, anime, live TV..."
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 pr-4 pl-10 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#ff3c3c]/50 focus:bg-white/[0.07]"
              />
            </div>

            <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.04] p-1">
              {(
                [
                  { id: 'movie', label: 'Movies' },
                  { id: 'tv', label: 'TV Series' },
                  { id: 'anime', label: 'Anime' },
                  { id: 'live', label: 'Live TV' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveType(tab.id)}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    activeType === tab.id
                      ? 'bg-[#ff3c3c] text-white shadow-[0_2px_12px_rgba(255,60,60,0.3)]'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {isPlayingUrl && (
              <button
                onClick={() => {
                  onResumeShader();
                  onClose();
                }}
                className="cursor-pointer rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              >
                Resume Demo Reel
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close catalog"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Grid Body */}
          <div className="mx-auto w-full max-w-[1200px] flex-1 overflow-y-auto px-6 py-6">
            <div className="mb-4 text-[11px] font-bold tracking-[0.14em] text-white/35 uppercase">
              {query.trim() ? `Results for "${query}"` : `Trending ${activeType === 'tv' ? 'Series' : activeType}`}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#ff3c3c]" />
                <span className="text-sm">Loading catalog...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="py-20 text-center text-sm text-white/35">No titles found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {items.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => {
                      if (item.type === 'live') {
                        onPlayMedia(item.id, item.title, 'live');
                        onClose();
                      } else {
                        setSelectedItem(item);
                      }
                    }}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] text-left transition duration-200 hover:-translate-y-1.5 hover:border-[#ff3c3c]/35 hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-white/[0.02]">
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={item.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/25">
                          {item.type === 'live' ? 'LIVE TV' : 'NO POSTER'}
                        </div>
                      )}
                      <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-sm">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
                          <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" />
                        </svg>
                        {item.rating}
                      </span>
                      <span className="absolute top-2 right-2 rounded-md bg-[#ff3c3c]/85 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
                        {item.type}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-xs font-semibold text-white/90">{item.title}</div>
                      <div className="mt-0.5 text-[11px] text-white/35">{item.year}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Detail View */
        <div className="mx-auto w-full max-w-[960px] flex-1 overflow-y-auto px-6 py-8">
          <button
            onClick={() => setSelectedItem(null)}
            className="mb-6 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ← Back to Catalog
          </button>

          <div className="flex flex-col gap-7 md:flex-row">
            <div className="w-44 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-2xl">
              {selectedItem.poster ? (
                <img src={selectedItem.poster} alt={selectedItem.title} className="w-full object-cover" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center text-xs text-white/25">No Poster</div>
              )}
            </div>

            <div className="flex-1">
              <h2 className="text-2xl font-extrabold tracking-tight text-white md:text-3xl">
                {selectedItem.title}
              </h2>

              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-white/50">
                <span className="font-bold text-amber-400">★ {selectedItem.rating}</span>
                {selectedItem.year && <span>{selectedItem.year}</span>}
                {details?.runtime && <span>{details.runtime}</span>}
                {details?.genres?.map((g) => (
                  <span
                    key={g}
                    className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/65"
                  >
                    {g}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/65">
                {selectedItem.overview || 'No description available.'}
              </p>

              {/* Server Selection */}
              <div className="mt-6">
                <div className="mb-2.5 text-[11px] font-bold tracking-[0.12em] text-white/35 uppercase">
                  Projector Source (Click to project on IMAX Screen)
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {getServers(selectedItem.type).map((srv) => (
                    <button
                      key={srv.id}
                      onClick={() => {
                        setSelectedServer(srv.id);
                        handlePlay(srv.id);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ff3c3c]/40 bg-gradient-to-br from-[#ff3c3c]/25 to-[#ff3c3c]/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:border-[#ff3c3c] hover:shadow-[0_6px_24px_rgba(255,60,60,0.3)]"
                    >
                      <span>▶ {srv.name}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                        {srv.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Anime Sub/Dub & Episodes */}
              {selectedItem.type === 'anime' && (
                <div className="mt-6">
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      onClick={() => setIsDub(false)}
                      className={`cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold ${
                        !isDub ? 'bg-[#ff3c3c] text-white' : 'bg-white/5 text-white/50'
                      }`}
                    >
                      SUB
                    </button>
                    <button
                      onClick={() => setIsDub(true)}
                      className={`cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold ${
                        isDub ? 'bg-[#ff3c3c] text-white' : 'bg-white/5 text-white/50'
                      }`}
                    >
                      DUB
                    </button>
                  </div>
                  <div className="grid max-h-56 grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-8">
                    {Array.from({ length: selectedItem.totalEpisodes || 12 }, (_, i) => i + 1).map((ep) => (
                      <button
                        key={ep}
                        onClick={() => {
                          setSelectedEpisode(ep);
                        }}
                        className={`cursor-pointer rounded-lg border py-2 text-xs font-semibold transition ${
                          selectedEpisode === ep
                            ? 'border-[#ff3c3c] bg-[#ff3c3c]/25 text-white'
                            : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/10'
                        }`}
                      >
                        Ep {ep}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TV Seasons & Episodes */}
              {selectedItem.type === 'tv' && details && details.seasons.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {details.seasons.map((s) => (
                      <button
                        key={s.seasonNumber}
                        onClick={() => {
                          setSelectedSeason(s.seasonNumber);
                          setSelectedEpisode(1);
                        }}
                        className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          selectedSeason === s.seasonNumber
                            ? 'border-[#ff3c3c]/50 bg-[#ff3c3c]/20 text-[#ff6b6b]'
                            : 'border-white/10 bg-white/[0.04] text-white/50 hover:text-white'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>

                  <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {episodes.map((ep) => (
                      <button
                        key={ep.number}
                        onClick={() => {
                          setSelectedEpisode(ep.number);
                        }}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                          selectedEpisode === ep.number
                            ? 'border-[#ff3c3c]/50 bg-[#ff3c3c]/15 text-white'
                            : 'border-white/[0.06] bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ff3c3c]/20 text-xs font-bold text-[#ff6b6b]">
                          {ep.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">{ep.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
