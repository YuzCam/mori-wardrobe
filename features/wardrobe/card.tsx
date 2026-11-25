'use client';
import type { Garment } from '../../types/wardrobe';
import { categoryName, colors } from '../../config/taxonomy';
import { ArrowUpRight } from 'lucide-react';
export default function GarmentCard({ garment }: { garment: Garment }) {
  const color = colors.find((c) => c.id === garment.colors[0]);
  return (
    <a href={`/wardrobe/${garment.id}`} className="garment-card">
      <div className="garment-image" style={{ background: garment.recipe.background }}>
        <img src={garment.thumbnailUrl} alt={garment.name} loading="lazy" decoding="async" />
        <span className="card-arrow">
          <ArrowUpRight size={16} />
        </span>
        <span className="card-season">
          {garment.seasons.length === 2 ? '跨季' : garment.seasons[0] === 'winter' ? '冬' : '夏'}
        </span>
      </div>
      <div className="garment-card-info">
        <h3>{garment.name}</h3>
        <div>
          <span>{categoryName(garment.category)}</span>
          <span className="card-color">
            {color && <i style={{ background: color.hex }} />} {color?.name ?? '待确认'}
          </span>
        </div>
      </div>
    </a>
  );
}
