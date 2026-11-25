import type { Garment } from '../../types/wardrobe.ts';
import { categoryName, colorName, styleName } from '../../config/taxonomy.ts';
export type Filters = {
  q: string;
  categories: string[];
  seasons: string[];
  colors: string[];
  styles: string[];
  sort: string;
};
export const emptyFilters: Filters = {
  q: '',
  categories: [],
  seasons: [],
  colors: [],
  styles: [],
  sort: 'newest',
};
export function filterGarments(items: Garment[], filters: Filters) {
  const term = filters.q.toLocaleLowerCase().trim();
  const any = (selected: string[], actual: string[]) =>
    !selected.length || selected.some((v) => actual.includes(v));
  return items
    .filter(
      (g) =>
        any(filters.categories, [g.category]) &&
        any(filters.seasons, g.seasons) &&
        any(filters.colors, g.colors) &&
        any(filters.styles, g.styles) &&
        (!term ||
          [
            g.name,
            g.notes,
            categoryName(g.category),
            ...g.colors.map(colorName),
            ...g.styles.map(styleName),
          ]
            .join(' ')
            .toLocaleLowerCase()
            .includes(term)),
    )
    .sort((a, b) =>
      filters.sort === 'name'
        ? a.name.localeCompare(b.name, 'zh')
        : filters.sort === 'oldest'
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
}
