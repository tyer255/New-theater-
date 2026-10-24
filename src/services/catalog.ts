/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { scoreTitleMatch as getMatchScore } from '../theatre/math';

export type MediaType = 'movie' | 'tv' | 'anime' | 'live';

export interface MediaItem {
  id: string;
  title: string;
  type: MediaType;
  year: string;
  rating: string;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  totalEpisodes?: number;
  category?: string;
}

export interface EpisodeInfo {
  number: number;
  name: string;
  overview: string;
  still: string | null;
}

export interface SeasonInfo {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

export interface MediaDetails {
  runtime: string;
  genres: string[];
  cast: string[];
  seasons: SeasonInfo[];
}

export interface ServerSource {
  id: string;
  name: string;
  badge: string;
}

const TMDB_API_KEY = '8265bd1679663a7ea12ac168da84d2e8';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const ANILIST_URL = 'https://graphql.anilist.co';
const LIVE_TV_URL = 'https://iptv-org.github.io/api/streams.json';
const LIVE_CHANNELS_URL = 'https://iptv-org.github.io/api/channels.json';

const SERVERS: Record<MediaType, ServerSource[]> = {
  movie: [
    { id: 'vidlink', name: 'VidLink', badge: 'Primary' },
    { id: 'autoembed', name: 'AutoEmbed', badge: 'Fast' },
    { id: 'vidsrc', name: 'VidSrc', badge: 'Backup' },
    { id: 'superembed', name: 'SuperEmbed', badge: 'Multi' },
  ],
  tv: [
    { id: 'vidlink', name: 'VidLink', badge: 'Primary' },
    { id: 'autoembed', name: 'AutoEmbed', badge: 'Fast' },
    { id: 'vidsrc', name: 'VidSrc', badge: 'Backup' },
    { id: 'superembed', name: 'SuperEmbed', badge: 'Multi' },
  ],
  anime: [
    { id: 'vidlink', name: 'VidLink', badge: 'Sub/Dub' },
    { id: 'vidsrc', name: 'VidSrc', badge: 'Backup' },
    { id: '2embed', name: '2Embed', badge: 'Alt' },
  ],
  live: [
    { id: 'hls', name: 'Direct Stream', badge: 'Live' },
  ],
};

const FALLBACK_CATALOG: Record<MediaType, MediaItem[]> = {
  movie: [
    {
      id: '157336',
      title: 'Interstellar',
      type: 'movie',
      year: '2014',
      rating: '8.7',
      poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
      overview: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    },
    {
      id: '693134',
      title: 'Dune: Part Two',
      type: 'movie',
      year: '2024',
      rating: '8.3',
      poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
      overview: 'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.',
    },
    {
      id: '872585',
      title: 'Oppenheimer',
      type: 'movie',
      year: '2023',
      rating: '8.1',
      poster: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
      overview: 'The story of J. Robert Oppenheimer\'s role in the development of the atomic bomb during World War II.',
    },
    {
      id: '335984',
      title: 'Blade Runner 2049',
      type: 'movie',
      year: '2017',
      rating: '7.6',
      poster: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/sAtoMqDVhNDQBc3QJL3RF6hlhGq.jpg',
      overview: 'Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what\'s left of society into chaos.',
    },
    {
      id: '27205',
      title: 'Inception',
      type: 'movie',
      year: '2010',
      rating: '8.4',
      poster: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
      overview: 'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible.',
    },
    {
      id: '155',
      title: 'The Dark Knight',
      type: 'movie',
      year: '2008',
      rating: '8.5',
      poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg',
      overview: 'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.',
    },
  ],
  tv: [
    {
      id: '95396',
      title: 'Severance',
      type: 'tv',
      year: '2022',
      rating: '8.4',
      poster: 'https://image.tmdb.org/t/p/w500/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/ixgFmf1X59PUZam2qbAfskx2gQr.jpg',
      overview: 'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.',
    },
    {
      id: '94605',
      title: 'Arcane',
      type: 'tv',
      year: '2021',
      rating: '8.8',
      poster: 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/rkB4LyZHo1NHXFEDHl9vSD9r1lI.jpg',
      overview: 'Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.',
    },
    {
      id: '1396',
      title: 'Breaking Bad',
      type: 'tv',
      year: '2008',
      rating: '8.9',
      poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/gc8PfyTqzqltKPW3X0cIVUGmagz.jpg',
      overview: 'Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer and given a prognosis of only two years left to live.',
    },
  ],
  anime: [
    {
      id: '154587',
      title: 'Frieren: Beyond Journey’s End',
      type: 'anime',
      year: '2023',
      rating: '9.1',
      poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg',
      backdrop: null,
      overview: 'The demon king has been defeated, and the victorious hero party returns home before disbanding. The four—mage Frieren, hero Himmel, priest Heiter, and warrior Eisen—reminisce about their decade-long journey.',
      totalEpisodes: 28,
    },
    {
      id: '113415',
      title: 'Jujutsu Kaisen',
      type: 'anime',
      year: '2020',
      rating: '8.6',
      poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg',
      backdrop: null,
      overview: 'A boy fights... for "the right death." Hardship, regret, shame: the negative feelings that humans feel become Curses that lurk in our everyday lives.',
      totalEpisodes: 24,
    },
  ],
  live: [
    {
      id: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8',
      title: 'NASA TV Public',
      type: 'live',
      year: 'LIVE',
      rating: 'HD',
      poster: null,
      backdrop: null,
      overview: 'Live coverage of space missions, ISS views of Earth, and science briefings.',
      category: 'Science',
    },
    {
      id: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8',
      title: 'DW English',
      type: 'live',
      year: 'LIVE',
      rating: 'HD',
      poster: null,
      backdrop: null,
      overview: 'International news and documentaries streaming live 24/7.',
      category: 'News',
    },
  ],
};

export function getServers(type: MediaType): ServerSource[] {
  return SERVERS[type] || SERVERS.movie;
}

export function getEmbedUrl(
  type: MediaType,
  id: string,
  server: string,
  season = 1,
  episode = 1,
  dub = false
): string {
  if (type === 'live') {
    return id;
  }

  if (type === 'movie') {
    switch (server) {
      case 'vidlink':
        return `https://vidlink.pro/movie/${id}?autoplay=true&primaryColor=ff3c3c`;
      case 'autoembed':
        return `https://player.autoembed.cc/embed/movie/${id}`;
      case 'vidsrc':
        return `https://vidsrc.xyz/embed/movie/${id}`;
      case 'superembed':
        return `https://multiembed.mov/?video_id=${id}&tmdb=1`;
      default:
        return `https://vidlink.pro/movie/${id}?autoplay=true`;
    }
  }

  if (type === 'tv') {
    switch (server) {
      case 'vidlink':
        return `https://vidlink.pro/tv/${id}/${season}/${episode}?autoplay=true&primaryColor=ff3c3c`;
      case 'autoembed':
        return `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`;
      case 'vidsrc':
        return `https://vidsrc.xyz/embed/tv/${id}/${season}-${episode}`;
      case 'superembed':
        return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
      default:
        return `https://vidlink.pro/tv/${id}/${season}/${episode}?autoplay=true`;
    }
  }

  if (type === 'anime') {
    const subOrDub = dub ? 'dub' : 'sub';
    switch (server) {
      case 'vidlink':
        return `https://vidlink.pro/anime/${id}/${episode}/${subOrDub}?autoplay=true&fallback=true`;
      case 'vidsrc':
        return `https://vidsrc.xyz/embed/anime/${id}/${episode}/${dub ? 1 : 0}`;
      default:
        return `https://vidlink.pro/anime/${id}/${episode}/${subOrDub}?autoplay=true&fallback=true`;
    }
  }

  return '';
}

let cachedLiveChannels: MediaItem[] | null = null;

async function fetchLiveChannels(): Promise<MediaItem[]> {
  if (cachedLiveChannels) return cachedLiveChannels;
  try {
    const [streamsRes, channelsRes] = await Promise.all([
      fetch(LIVE_TV_URL),
      fetch(LIVE_CHANNELS_URL),
    ]);
    const streams = await streamsRes.json();
    const channels = await channelsRes.json();

    const channelMap = new Map<string, any>();
    for (const c of channels) {
      if (c.id && !c.is_nsfw) {
        channelMap.set(c.id, c);
      }
    }

    const items: MediaItem[] = [];
    for (const s of streams) {
      if (!s.channel || !s.url || !s.url.endsWith('.m3u8')) continue;
      const ch = channelMap.get(s.channel);
      if (!ch) continue;
      items.push({
        id: s.url,
        title: ch.name || s.channel,
        type: 'live',
        year: 'LIVE',
        rating: s.quality || 'HD',
        poster: ch.logo || null,
        backdrop: null,
        overview: `${(ch.categories || ['General']).join(', ')} · ${ch.country || 'Global'}`,
        category: (ch.categories && ch.categories[0]) || 'General',
      });
      if (items.length >= 250) break;
    }

    cachedLiveChannels = items.length > 0 ? items : FALLBACK_CATALOG.live;
    return cachedLiveChannels;
  } catch {
    return FALLBACK_CATALOG.live;
  }
}

export async function getTrending(type: MediaType = 'movie', page = 1): Promise<MediaItem[]> {
  if (type === 'live') {
    const all = await fetchLiveChannels();
    return all.slice((page - 1) * 24, page * 24);
  }

  if (type === 'anime') {
    const query = `
      query ($page: Int) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
            id
            title { english romaji }
            startDate { year }
            averageScore
            coverImage { large }
            bannerImage
            description(asHtml: false)
            episodes
          }
        }
      }
    `;
    try {
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { page } }),
      });
      const json = await res.json();
      const list = json?.data?.Page?.media || [];
      if (!list.length) return FALLBACK_CATALOG.anime;
      return list.map((m: any) => ({
        id: String(m.id),
        title: m.title?.english || m.title?.romaji || 'Untitled',
        type: 'anime' as MediaType,
        year: m.startDate?.year ? String(m.startDate.year) : '',
        rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : 'N/A',
        poster: m.coverImage?.large || null,
        backdrop: m.bannerImage || null,
        overview: (m.description || '').replace(/<[^>]*>/g, ''),
        totalEpisodes: m.episodes || 12,
      }));
    } catch {
      return FALLBACK_CATALOG.anime;
    }
  }

  try {
    const endpoint = type === 'tv' ? 'trending/tv/week' : 'trending/movie/week';
    const res = await fetch(`${TMDB_BASE}/${endpoint}?api_key=${TMDB_API_KEY}&page=${page}`);
    const data = await res.json();
    if (!data?.results?.length) return FALLBACK_CATALOG[type];
    return data.results.map((item: any) => ({
      id: String(item.id),
      title: item.title || item.name || 'Untitled',
      type,
      year: (item.release_date || item.first_air_date || '').slice(0, 4),
      rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
      poster: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
      backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
      overview: item.overview || '',
    }));
  } catch {
    return FALLBACK_CATALOG[type];
  }
}

export async function searchCatalog(query: string, type: MediaType = 'movie', page = 1): Promise<MediaItem[]> {
  if (!query.trim()) return getTrending(type, page);

  if (type === 'live') {
    const all = await fetchLiveChannels();
    return all
      .filter((item) => getMatchScore(item.title, query) > 0)
      .sort((a, b) => getMatchScore(b.title, query) - getMatchScore(a.title, query))
      .slice(0, 40);
  }

  if (type === 'anime') {
    const gql = `
      query ($search: String, $page: Int) {
        Page(page: $page, perPage: 20) {
          media(search: $search, type: ANIME, isAdult: false) {
            id
            title { english romaji }
            startDate { year }
            averageScore
            coverImage { large }
            bannerImage
            description(asHtml: false)
            episodes
          }
        }
      }
    `;
    try {
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gql, variables: { search: query, page } }),
      });
      const json = await res.json();
      const list = json?.data?.Page?.media || [];
      return list.map((m: any) => ({
        id: String(m.id),
        title: m.title?.english || m.title?.romaji || 'Untitled',
        type: 'anime' as MediaType,
        year: m.startDate?.year ? String(m.startDate.year) : '',
        rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : 'N/A',
        poster: m.coverImage?.large || null,
        backdrop: m.bannerImage || null,
        overview: (m.description || '').replace(/<[^>]*>/g, ''),
        totalEpisodes: m.episodes || 12,
      }));
    } catch {
      return FALLBACK_CATALOG.anime.filter((i) => getMatchScore(i.title, query) > 0);
    }
  }

  try {
    const endpoint = type === 'tv' ? 'search/tv' : 'search/movie';
    const res = await fetch(
      `${TMDB_BASE}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`
    );
    const data = await res.json();
    const results = data?.results || [];
    return results
      .map((item: any) => ({
        id: String(item.id),
        title: item.title || item.name || 'Untitled',
        type,
        year: (item.release_date || item.first_air_date || '').slice(0, 4),
        rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
        poster: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
        backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
        overview: item.overview || '',
      }))
      .sort((a: MediaItem, b: MediaItem) => getMatchScore(b.title, query) - getMatchScore(a.title, query));
  } catch {
    return FALLBACK_CATALOG[type].filter((i) => getMatchScore(i.title, query) > 0);
  }
}

export async function getDetails(id: string, type: MediaType): Promise<MediaDetails> {
  if (type === 'live') {
    return {
      runtime: '24/7 Live Stream',
      genres: ['Live Broadcast'],
      cast: [],
      seasons: [],
    };
  }

  if (type === 'anime') {
    return {
      runtime: '24m / ep',
      genres: ['Anime', 'Animation'],
      cast: [],
      seasons: [],
    };
  }

  try {
    const res = await fetch(
      `${TMDB_BASE}/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
    );
    const data = await res.json();
    const runtime =
      type === 'movie' && data.runtime
        ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`
        : data.number_of_seasons
        ? `${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}`
        : '';
    const genres = (data.genres || []).map((g: any) => g.name);
    const cast = (data.credits?.cast || []).slice(0, 6).map((c: any) => c.name);
    const seasons: SeasonInfo[] = (data.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episodeCount: s.episode_count || 1,
      }));
    return { runtime, genres, cast, seasons };
  } catch {
    return {
      runtime: type === 'movie' ? '2h 15m' : '1 Season',
      genres: ['Sci-Fi', 'Drama'],
      cast: [],
      seasons: type === 'tv' ? [{ seasonNumber: 1, name: 'Season 1', episodeCount: 8 }] : [],
    };
  }
}

export async function getSeasonEpisodes(id: string, seasonNumber: number): Promise<EpisodeInfo[]> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/tv/${id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
    );
    const data = await res.json();
    return (data.episodes || []).map((ep: any) => ({
      number: ep.episode_number,
      name: ep.name || `Episode ${ep.episode_number}`,
      overview: ep.overview || '',
      still: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
    }));
  } catch {
    return Array.from({ length: 8 }, (_, idx) => ({
      number: idx + 1,
      name: `Episode ${idx + 1}`,
      overview: '',
      still: null,
    }));
  }
}
