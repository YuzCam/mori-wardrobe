export type Category =
  | 'top'
  | 'outerwear'
  | 'camisole'
  | 'trousers'
  | 'skirt'
  | 'dress'
  | 'suit'
  | 'shoes'
  | 'bag'
  | 'accessory';
export type Season = 'summer' | 'winter' | 'spring-autumn';
export type EditRecipe = {
  brightness: number;
  contrast: number;
  background: string;
  crop: { x: number; y: number; width: number; height: number } | null;
  rotation: number;
};
export type Recognition = {
  model: string;
  categoryCandidates: { label: Category; score: number }[];
  styleCandidates: { label: string; score: number }[];
  source: 'model' | 'manual';
  confirmed: boolean;
};
export type Garment = {
  id: string;
  name: string;
  category: Category;
  subcategory?: string;
  seasons: Season[];
  colors: string[];
  styles: string[];
  notes: string;
  warmth: number;
  imageUrl: string;
  originalUrl: string;
  maskUrl?: string;
  thumbnailUrl: string;
  recipe: EditRecipe;
  recognition: Recognition | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type GarmentInput = Pick<
  Garment,
  | 'name'
  | 'category'
  | 'subcategory'
  | 'seasons'
  | 'colors'
  | 'styles'
  | 'notes'
  | 'warmth'
  | 'recipe'
  | 'recognition'
>;
export type Weather = {
  city: string;
  latitude: number;
  longitude: number;
  temperature: number;
  apparent: number;
  min: number;
  max: number;
  rain: number;
  code: number;
  updatedAt: string;
  manual?: boolean;
  stale?: boolean;
};
export type Preferences = {
  city: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  season: Season;
  theme: 'seasonal' | 'summer' | 'winter';
};
export type Outfit = {
  id: string;
  garmentIds: string[];
  date: string;
  reason: string;
  title: string;
  favorite: boolean;
  worn: boolean;
  createdAt: string;
  wornAt?: string;
  wardrobeVersion?: string;
  contextKey?: string;
};
export const defaultRecipe: EditRecipe = {
  brightness: 100,
  contrast: 100,
  background: '#f2eee8',
  crop: null,
  rotation: 0,
};
export const defaultPreferences: Preferences = {
  city: '',
  latitude: null,
  longitude: null,
  timezone: 'Asia/Shanghai',
  season: 'winter',
  theme: 'seasonal',
};
