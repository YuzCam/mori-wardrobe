import type { Category } from '../types/wardrobe';
import { categoryName } from './taxonomy';

export const categoryGroups = [
  { id: 'sets', name: '套装' },
  { id: 'tops', name: '上装' },
  { id: 'bottoms', name: '下装' },
  { id: 'footwear', name: '鞋子' },
  { id: 'accessories', name: '配饰' },
] as const;
export type ClothingGroup = (typeof categoryGroups)[number]['id'];
export const detailedCategories: {
  id: string;
  name: string;
  group: ClothingGroup;
  category: Category;
}[] = [
  { id: 'set', name: '套装', group: 'sets', category: 'suit' },
  { id: 'camisole', name: '吊带', group: 'tops', category: 'camisole' },
  { id: 't-shirt', name: '短袖T恤', group: 'tops', category: 'top' },
  { id: 'base-layer', name: '打底衫', group: 'tops', category: 'top' },
  { id: 'shirt', name: '衬衫', group: 'tops', category: 'top' },
  { id: 'vest', name: '马甲', group: 'tops', category: 'top' },
  { id: 'sweatshirt', name: '卫衣', group: 'tops', category: 'top' },
  { id: 'sweater', name: '毛衣', group: 'tops', category: 'top' },
  { id: 'short-coat', name: '短款外套', group: 'tops', category: 'outerwear' },
  { id: 'long-coat', name: '长款外套', group: 'tops', category: 'outerwear' },
  { id: 'dress', name: '连衣裙', group: 'tops', category: 'dress' },
  { id: 'shorts', name: '短裤', group: 'bottoms', category: 'trousers' },
  { id: 'trousers', name: '长裤', group: 'bottoms', category: 'trousers' },
  { id: 'leggings', name: '打底裤', group: 'bottoms', category: 'trousers' },
  { id: 'short-skirt', name: '短裙', group: 'bottoms', category: 'skirt' },
  { id: 'long-skirt', name: '长裙', group: 'bottoms', category: 'skirt' },
  { id: 'shoes', name: '鞋子', group: 'footwear', category: 'shoes' },
  { id: 'boots', name: '靴子', group: 'footwear', category: 'shoes' },
  { id: 'hat', name: '帽子', group: 'accessories', category: 'accessory' },
  { id: 'tie', name: '领带', group: 'accessories', category: 'accessory' },
  { id: 'belt', name: '腰带', group: 'accessories', category: 'accessory' },
  { id: 'scarf', name: '围巾', group: 'accessories', category: 'accessory' },
  { id: 'gloves', name: '手套', group: 'accessories', category: 'accessory' },
];
export function clothingGroup(item: { category: Category; subcategory?: string }): ClothingGroup {
  return (
    detailedCategories.find((d) => d.id === item.subcategory)?.group ??
    (item.category === 'suit'
      ? 'sets'
      : ['trousers', 'skirt'].includes(item.category)
        ? 'bottoms'
        : item.category === 'shoes'
          ? 'footwear'
          : ['bag', 'accessory'].includes(item.category)
            ? 'accessories'
            : 'tops')
  );
}
export const clothingName = (item: { category: Category; subcategory?: string }) =>
  detailedCategories.find((d) => d.id === item.subcategory)?.name ?? categoryName(item.category);
export const groupName = (item: { category: Category; subcategory?: string }) =>
  categoryGroups.find((g) => g.id === clothingGroup(item))!.name;
export function matchesCategory(
  item: { category: Category; subcategory?: string },
  selection: string,
) {
  return selection.startsWith('group:')
    ? clothingGroup(item) === selection.slice(6)
    : selection.startsWith('detail:')
      ? item.subcategory === selection.slice(7)
      : item.category === selection;
}
