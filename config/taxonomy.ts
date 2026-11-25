import type { Category } from '../types/wardrobe';
export const categories: { id: Category; name: string; prompt: string; role: string }[] = [
  { id: 'top', name: '上衣', prompt: 'a shirt, t-shirt, sweater or blouse', role: 'top' },
  {
    id: 'outerwear',
    name: '外套',
    prompt: 'a coat, jacket, cardigan or blazer',
    role: 'outerwear',
  },
  { id: 'camisole', name: '吊带', prompt: 'a camisole or sleeveless tank top', role: 'top' },
  { id: 'trousers', name: '裤子', prompt: 'a pair of pants, jeans or shorts', role: 'bottom' },
  { id: 'skirt', name: '短裙', prompt: 'a skirt', role: 'bottom' },
  { id: 'dress', name: '连衣裙', prompt: 'a dress', role: 'full' },
  {
    id: 'suit',
    name: '套装',
    prompt: 'a matching two-piece clothing outfit or suit',
    role: 'full',
  },
  { id: 'shoes', name: '鞋', prompt: 'a pair of shoes, sneakers, boots or sandals', role: 'shoes' },
  { id: 'bag', name: '包', prompt: 'a handbag, backpack or shoulder bag', role: 'bag' },
  {
    id: 'accessory',
    name: '配饰',
    prompt: 'a scarf, hat, jewelry, belt or fashion accessory',
    role: 'accessory',
  },
];
export const seasons = [
  { id: 'spring-autumn', name: '春秋季' },
  { id: 'summer', name: '夏季' },
  { id: 'winter', name: '冬季' },
] as const;
export const colors = [
  { id: 'cream', name: '奶油白', hex: '#eee9df' },
  { id: 'oat', name: '燕麦米', hex: '#c9b798' },
  { id: 'peach', name: '蜜桃粉', hex: '#e4b1b2' },
  { id: 'coral', name: '珊瑚橘', hex: '#db806b' },
  { id: 'yellow', name: '元气黄', hex: '#dfc468' },
  { id: 'mint', name: '薄荷绿', hex: '#9cbda9' },
  { id: 'blue', name: '天空蓝', hex: '#9cb7cb' },
  { id: 'lavender', name: '薰衣草紫', hex: '#b3a0c7' },
  { id: 'earth', name: '大地色', hex: '#8b6b52' },
  { id: 'black', name: '经典黑', hex: '#343235' },
  { id: 'gray', name: '雾感灰', hex: '#a3a4a2' },
  { id: 'navy', name: '牛仔蓝', hex: '#526780' },
  { id: 'contrast', name: '复古撞色', hex: '#b77469' },
];
export const styles = [
  { id: 'minimal-girl', name: '极简少女', prompt: 'minimal feminine casual fashion' },
  {
    id: 'vintage-chinese',
    name: '古着国风',
    prompt: 'vintage traditional Chinese inspired clothing',
  },
  {
    id: 'neo-chinese',
    name: '新中式',
    prompt: 'modern Chinese style clothing with mandarin collars and frog closures',
  },
  { id: 'relaxed', name: '松弛休闲', prompt: 'relaxed casual loose fitting everyday clothing' },
  { id: 'french', name: '温柔法式', prompt: 'romantic elegant French feminine clothing' },
  { id: 'preppy', name: '甜酷学院', prompt: 'youthful preppy school inspired edgy fashion' },
  { id: 'literary', name: '复古文艺', prompt: 'vintage artistic retro clothing in earthy colors' },
  { id: 'sport', name: '运动活力', prompt: 'athletic activewear sports clothing' },
  { id: 'minimal', name: '极简高级', prompt: 'minimalist sophisticated tailored fashion' },
  { id: 'holiday', name: '度假', prompt: 'summer resort beach vacation clothing' },
];
export const categoryName = (id: string) => categories.find((x) => x.id === id)?.name ?? id;
export const seasonName = (id: string) => seasons.find((x) => x.id === id)?.name ?? id;
export const customColor = (id: string) => /^custom:#[0-9a-f]{6}$/i.test(id);
export const colorHex = (id: string) =>
  customColor(id) ? id.slice(7) : (colors.find((x) => x.id === id)?.hex ?? '#aaa');
export const colorName = (id: string) =>
  customColor(id)
    ? `自定义 ${id.slice(7).toUpperCase()}`
    : (colors.find((x) => x.id === id)?.name ?? id);
export const styleName = (id: string) => styles.find((x) => x.id === id)?.name ?? id;
export const backgrounds = ['#f2eee8', '#fffefb', '#e9e4f1', '#e4eee7', '#e5edf4', '#e9e8e5'];
