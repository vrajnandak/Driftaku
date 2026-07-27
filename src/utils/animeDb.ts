// src/utils/animeDb.ts
import dbRaw from '../assets/data/anime_world_db.json';

// Cast to any to bypass strict type checking on the massive dynamic JSON
const db: any = dbRaw;

// We build these Maps ONCE when the server/worker starts, 
// saving massive CPU time on individual page requests.
const animeMap = new Map();
const charMap = new Map();
const studioMap = new Map();

if (db && db.anime && db.characters && db.studios) {
    db.anime.forEach((a: any) => animeMap.set(a.id, a));
    db.characters.forEach((c: any) => charMap.set(c.id, c));
    db.studios.forEach((s: any) => studioMap.set(s.id, s));
}

export const getAllAnime = () => {
    return db?.anime || [];
};

export const getTopAnime = () => {
    return db?.anime?.slice(0, 24) || [];
};

export const getAnimeById = (id: number) => {
    return animeMap.get(id);
};

export const getSimilarAnime = (id: number) => {
    if (!db || !db.similarity) return [];
    const similarIds = db.similarity[id.toString()] || [];
    return similarIds.map((aid: number) => animeMap.get(aid)).filter(Boolean);
};

export const resolveStudios = (studioIds: number[]) => {
    if (!studioIds) return [];
    return studioIds.map(sid => studioMap.get(sid)).filter(Boolean);
};

export const resolveCharacters = (charIds: number[]) => {
    if (!charIds) return [];
    return charIds.map(cid => charMap.get(cid)).filter(Boolean);
};

export const slugify = (text: string) => {
    return (text || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
};