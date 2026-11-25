import type { LocalGarment } from './types';
import { categoryName, colorName, styleName } from '../../config/taxonomy';
import { clothingName, groupName, matchesCategory } from '../../config/clothing';
export type Filters = {
  q: string;
  categories: string[];
  seasons: string[];
  colors: string[];
  styles: string[];
  sort: 'newest' | 'oldest' | 'name';
};
export const emptyFilters: Filters = {
  q: '',
  categories: [],
  seasons: [],
  colors: [],
  styles: [],
  sort: 'newest',
};
export const toggle = (values: string[], id: string) =>
  values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
export function filterGarments(items: LocalGarment[], filters: Filters, trash = false) {
  const term = filters.q.trim().toLocaleLowerCase();
  const matches = (selected: string[], actual: string[]) =>
    !selected.length || selected.some((id) => actual.includes(id));
  return items
    .filter(
      (g) =>
        Boolean(g.deletedAt) === trash &&
        (!filters.categories.length || filters.categories.some((c) => matchesCategory(g, c))) &&
        matches(filters.seasons, g.seasons) &&
        matches(filters.colors, g.colors) &&
        matches(filters.styles, g.styles) &&
        (!term ||
          [
            g.name,
            g.notes,
            categoryName(g.category),
            clothingName(g),
            groupName(g),
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
