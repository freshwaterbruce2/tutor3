/**
 * Curated Music Library - Updated 2026-02-17
 * Radio stations for live streaming, grouped into a study shelf and a break shelf.
 * Curated downloads removed — see Option B redesign.
 */

import type { RadioStation } from '../types';

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'radio-chill-1',
    name: 'SomaFM - Groove Salad',
    genre: 'Chill / Ambient Beats',
    category: 'chill',
    shelf: 'study',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/groovesalad-128-mp3',
      'https://ice4.somafm.com/groovesalad-128-mp3',
    ],
    description: 'Chill grooves and ambient beats',
  },
  {
    id: 'radio-ambient-2',
    name: 'SomaFM - Space Station',
    genre: 'Space / Ambient',
    category: 'ambient',
    shelf: 'study',
    streamUrl: 'https://ice1.somafm.com/spacestation-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/spacestation-128-mp3',
      'https://ice4.somafm.com/spacestation-128-mp3',
    ],
    description: 'Spacemusic and ambient textures',
  },
  {
    id: 'radio-classical-1',
    name: 'WQXR Classical (New York)',
    genre: 'Classical / Orchestra',
    category: 'classical',
    shelf: 'study',
    streamUrl: 'https://stream.wqxr.org/wqxr',
    fallbackUrls: ['https://stream.wqxr.org/wqxr-web'],
    description: 'Classical music from New York',
  },
  {
    id: 'radio-gaming-1',
    name: 'SomaFM - Sonic Universe',
    genre: 'Soundtracks',
    category: 'gaming',
    shelf: 'study',
    streamUrl: 'https://ice1.somafm.com/sonicuniverse-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/sonicuniverse-128-mp3',
      'https://ice4.somafm.com/sonicuniverse-128-mp3',
    ],
    description: 'Sci-fi and space game soundtracks',
  },
  {
    id: 'radio-ambient-1',
    name: 'SomaFM - Drone Zone',
    genre: 'Ambient / Drone',
    category: 'ambient',
    shelf: 'study',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/dronezone-128-mp3',
      'https://ice4.somafm.com/dronezone-128-mp3',
    ],
    description: 'A low, continuous ambient texture',
  },
  {
    id: 'radio-edm-1',
    name: 'SomaFM - Beat Blender',
    genre: 'House / Techno',
    category: 'edm',
    shelf: 'break',
    streamUrl: 'https://ice1.somafm.com/beatblender-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/beatblender-128-mp3',
      'https://ice4.somafm.com/beatblender-128-mp3',
    ],
    description: 'Deep house, techno, and progressive beats',
  },
  {
    id: 'radio-variety-1',
    name: 'SomaFM - Indie Pop Rocks',
    genre: 'Indie / Alternative',
    category: 'variety',
    shelf: 'break',
    streamUrl: 'https://ice1.somafm.com/indiepop-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/indiepop-128-mp3',
      'https://ice4.somafm.com/indiepop-128-mp3',
    ],
    description: 'Indie pop and rock from the 80s to today',
  },
  {
    id: 'radio-variety-2',
    name: 'SomaFM - Underground 80s',
    genre: 'Synth / New Wave',
    category: 'variety',
    shelf: 'break',
    streamUrl: 'https://ice1.somafm.com/u80s-128-mp3',
    fallbackUrls: ['https://ice2.somafm.com/u80s-128-mp3', 'https://ice4.somafm.com/u80s-128-mp3'],
    description: 'Alternative 80s synth and new wave',
  },
  {
    id: 'radio-anime-1',
    name: 'LISTEN.moe - Anime Music',
    genre: 'Anime / J-Pop / Soundtracks',
    category: 'anime',
    shelf: 'break',
    streamUrl: 'https://listen.moe/stream',
    fallbackUrls: ['https://listen.moe/fallback', 'https://listen.moe/opus'],
    description: 'Anime soundtracks, openings, and J-pop',
  },
  {
    id: 'radio-chill-2',
    name: 'SomaFM - Cliq Hop',
    genre: 'Trip-Hop / IDM',
    category: 'chill',
    shelf: 'break',
    streamUrl: 'https://ice1.somafm.com/cliqhop-128-mp3',
    fallbackUrls: [
      'https://ice2.somafm.com/cliqhop-128-mp3',
      'https://ice4.somafm.com/cliqhop-128-mp3',
    ],
    description: 'Abstract beats and glitch hop',
  },
];
