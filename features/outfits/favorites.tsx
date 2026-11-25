'use client';
import { ArrowRight, Heart } from 'lucide-react';
import { useOutfits, useWardrobe } from '../wardrobe/hooks';
import { ErrorState, Loading } from '../../components/ui/common';

export default function Favorites({ owner }: { owner: string }) {
  const wardrobe = useWardrobe(owner);
  const outfits = useOutfits(owner);
  const items = wardrobe.data?.items ?? [];
  const saved = outfits.data?.items.filter((outfit) => outfit.favorite) ?? [];
  const error = outfits.error ?? wardrobe.error;
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR FAVORITE LOOKS, ALL TOGETHER</p>
          <h1>
            收藏的搭配<span className="heading-dot">.</span>
          </h1>
          <p>把心动的灵感留下，下一次出门也能轻松找到。</p>
        </div>
        <a href="/" className="text-link">
          今日灵感
          <ArrowRight size={16} />
        </a>
      </div>
      {error ? (
        <ErrorState
          message={error.message}
          retry={() => {
            outfits.refetch();
            wardrobe.refetch();
          }}
        />
      ) : outfits.isPending || wardrobe.isPending ? (
        <Loading text="正在找出你收藏的搭配…" />
      ) : saved.length ? (
        <>
          <p className="favorites-count">共 {saved.length} 套收藏搭配</p>
          <div className="saved-outfits-grid">
            {saved.map((outfit) => (
              <article className="saved-outfit-card" key={outfit.id}>
                <div className="mini-outfit-images">
                  {outfit.garmentIds.map((id) => {
                    const garment = items.find((item) => item.id === id);
                    return garment ? (
                      <a href={`/wardrobe/${id}`} key={id} aria-label={`查看${garment.name}`}>
                        <img src={garment.thumbnailUrl} alt={garment.name} loading="lazy" />
                      </a>
                    ) : null;
                  })}
                </div>
                <h3>{outfit.title}</h3>
                <p>{outfit.reason}</p>
                <span className="subtle">{outfit.date}</span>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="outfit-empty">
          <Heart size={30} />
          <h3>还没有收藏的搭配</h3>
          <p>点击今日搭配上的爱心，把喜欢的穿搭留在这里。</p>
          <a href="/" className="button primary">
            去看看今日灵感
            <ArrowRight size={16} />
          </a>
        </div>
      )}
    </div>
  );
}
