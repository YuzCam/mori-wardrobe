'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  RefreshCw,
  Heart,
  Check,
  Shirt,
  CalendarDays,
  LockKeyhole,
  Flower2,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useWardrobe, useOutfits, usePreferences } from '../wardrobe/hooks';
import { WeatherCard, useWeather } from '../weather/weather';
import { post, patch } from '../../lib/client/api';
import type { Outfit, Garment } from '../../types/wardrobe';
import { Loading, ErrorState } from '../../components/ui/common';
import GarmentCard from '../wardrobe/card';
import GarmentArt from '../../components/garment-art';
import { wardrobeVersion } from '../outfits/engine';
export default function Dashboard({ owner }: { owner: string }) {
  const wardrobe = useWardrobe(owner);
  const allOutfits = useOutfits(owner);
  const preferences = usePreferences(owner);
  const weather = useWeather(owner);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lockedId, setLockedId] = useState('');
  const [date, setDate] = useState('');
  const client = useQueryClient();
  const generatedKey = useRef('');
  const items = wardrobe.data?.items ?? [];
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setLockedId(params.get('lock') ?? '');
    setDate(
      new Intl.DateTimeFormat('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Shanghai',
      }).format(new Date()),
    );
  }, []);
  async function generate(refresh = false) {
    if (!items.length) return;
    setBusy(true);
    setError('');
    try {
      const response = await post<{ items: Outfit[] }>('/api/outfits/generate', {
        refresh,
        lockedId: lockedId || undefined,
        weather: weather.weather ? { apparent: weather.weather.apparent } : null,
      });
      setOutfits(response.items);
      setIndex(0);
      if (refresh && response.items.length) toast.success('新的穿搭灵感来了');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!wardrobe.data || !preferences.data || weather.isFetching || !items.length) return;
    const key = `${wardrobeVersion(items)}:${weather.weather?.apparent ?? preferences.data.season}:${lockedId}`;
    if (generatedKey.current === key) return;
    generatedKey.current = key;
    generate(false);
  }, [wardrobe.data, preferences.data, weather.weather, weather.isFetching, lockedId]);
  const outfit = outfits[index];
  const outfitItems = outfit?.garmentIds
    .map((id) => items.find((g) => g.id === id))
    .filter(Boolean) as Garment[] | undefined;
  async function updateOutfit(field: 'favorite' | 'worn') {
    if (!outfit || saving) return;
    setSaving(true);
    try {
      const updated = await patch<Outfit>(`/api/outfits/${outfit.id}`, { [field]: !outfit[field] });
      setOutfits((v) => v.map((o) => (o.id === updated.id ? updated : o)));
      await client.invalidateQueries({ queryKey: ['outfits', owner] });
      toast.success(
        field === 'favorite'
          ? updated.favorite
            ? '已收藏这套搭配'
            : '已取消收藏'
          : updated.worn
            ? '记下啦，今天穿这套'
            : '已取消穿着记录',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const saved = allOutfits.data?.items.filter((o) => o.favorite) ?? [];
  return (
    <div className="dashboard">
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">A LITTLE INSPIRATION FOR EVERY DAY</p>
          <h1>
            今天，也穿得喜欢<span className="heading-dot">.</span>
          </h1>
          <p>从熟悉的衣橱里，发现一点新的自己。</p>
        </div>
        <span className="date-label">
          <CalendarDays size={15} />
          {date}
        </span>
      </div>
      <div className="dashboard-top-grid">
        <section className="inspiration-hero">
          <div className="hero-copy">
            <span className="hero-label">
              <span />
              YOUR STYLE, YOUR STORY
            </span>
            <h2>
              衣服不必很多，
              <br />
              喜欢可以<span>很多。</span>
            </h2>
            <p>
              把每一件心动好好收藏，
              <br />
              让每天的搭配，多一点从容。
            </p>
            <a href="/upload" className="button hero-button">
              <Plus size={16} />
              收进一件新喜欢
              <ArrowUpRight size={16} />
            </a>
            <span className="hero-small">MAKE ROOM FOR WHAT YOU LOVE.</span>
          </div>
          <div className="hero-collage" aria-label="风格灵感插画">
            <span className="collage-star">
              <Sparkles size={27} strokeWidth={1.1} />
            </span>
            <div className="collage-card card-knit">
              <GarmentArt color="#c4b4a0" kind="sweater" />
              <span>SOFT & SIMPLE</span>
            </div>
            <div className="collage-card card-pants">
              <GarmentArt color="#777e78" kind="trousers" />
            </div>
            <div className="collage-card card-bag">
              <GarmentArt color="#926f55" kind="bag" />
            </div>
            <span className="collage-note">
              a wardrobe
              <br />
              that feels like you.
            </span>
            <span className="illustration-caption">风格灵感插画</span>
          </div>
        </section>
        <WeatherCard owner={owner} state={weather} />
      </div>
      <div className="stat-strip">
        <div>
          <span className="stat-icon">
            <Shirt size={20} />
          </span>
          <span>
            <strong>
              {items.length}
              <small>件</small>
            </strong>
            <p>心爱单品</p>
          </span>
        </div>
        <span className="stat-divider" />
        <div>
          <span className="stat-icon">
            <Sparkles size={20} />
          </span>
          <span>
            <strong>
              {outfits.length}
              <small>套</small>
            </strong>
            <p>今日灵感</p>
          </span>
        </div>
        <span className="stat-divider" />
        <div>
          <span className="stat-icon">
            <Heart size={20} />
          </span>
          <span>
            <strong>
              {saved.length}
              <small>套</small>
            </strong>
            <p>收藏搭配</p>
          </span>
        </div>
        <p className="stat-saying">“ 穿衣服，也是在照顾自己的心情。 ”</p>
      </div>
      <section className="today-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PICKED FROM YOUR WARDROBE</p>
            <h2>
              今天，试试这样穿
              <Sparkles size={20} />
            </h2>
          </div>
          <div className="section-actions">
            <button
              className="button secondary small"
              onClick={() => generate(true)}
              disabled={!items.length || busy}
            >
              <RefreshCw size={14} className={busy ? 'spin' : ''} />
              {busy ? '搭配中…' : '换一套灵感'}
            </button>
          </div>
        </div>
        {wardrobe.isPending ? (
          <Loading />
        ) : wardrobe.error ? (
          <ErrorState message={wardrobe.error.message} retry={() => wardrobe.refetch()} />
        ) : !items.length ? (
          <div className="outfit-empty first-outfit">
            <div className="outfit-empty-graphic">
              <GarmentArt kind="cardigan" color="#c6b5d2" />
              <span>+</span>
              <GarmentArt kind="trousers" color="#a6afa1" />
              <i>
                <Sparkles size={18} />
              </i>
            </div>
            <div>
              <span className="pill">你的第一套灵感，就快来了</span>
              <h3>
                先收藏几件喜欢，
                <br />
                我们来发现搭配的可能。
              </h3>
              <p>
                添加上装和下装，或一件连衣裙、套装。
                <br />
                冷天再准备一件外套，推荐就更完整了。
              </p>
              <a href="/upload" className="text-link">
                开始整理衣橱
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        ) : busy ? (
          <Loading text="正在从你的衣橱里寻找灵感…" />
        ) : error ? (
          <ErrorState message={error} retry={() => generate(false)} />
        ) : outfit && outfitItems ? (
          <div className="outfit-card">
            <div className="outfit-board">
              {outfitItems.map((g, i) => (
                <a
                  href={`/wardrobe/${g.id}`}
                  key={g.id}
                  className={`outfit-piece piece-${i}`}
                  style={{ background: g.recipe.background }}
                >
                  <img src={g.thumbnailUrl} alt={g.name} />
                  <span>{g.name}</span>
                </a>
              ))}
              <span className="board-stamp">
                MŌRI
                <br />
                <small>DAILY EDIT</small>
              </span>
            </div>
            <div className="outfit-copy">
              <span className="outfit-number">
                LOOK {String(index + 1).padStart(2, '0')} / TODAY
              </span>
              <h3>{outfit.title}</h3>
              <p>{outfit.reason}</p>
              <label className="lock-select-label">
                <LockKeyhole size={14} />
                围绕一件单品搭配
                <select
                  value={lockedId}
                  onChange={(e) => {
                    setLockedId(e.target.value);
                    generatedKey.current = '';
                  }}
                  aria-label="锁定搭配单品"
                >
                  <option value="">自由搭配</option>
                  {items.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="outfit-actions">
                <button
                  className="button primary"
                  onClick={() => updateOutfit('worn')}
                  disabled={saving}
                >
                  <Check size={16} />
                  {outfit.worn ? '今天已穿这套' : '今天穿这套'}
                </button>
                <button
                  className={`button secondary heart-button ${outfit.favorite ? 'favorited' : ''}`}
                  onClick={() => updateOutfit('favorite')}
                  disabled={saving}
                  aria-label={outfit.favorite ? '取消收藏搭配' : '收藏搭配'}
                >
                  <Heart size={17} fill={outfit.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              {outfits.length > 1 && (
                <div className="outfit-pagination">
                  <button
                    className="icon-button"
                    aria-label="上一套"
                    onClick={() => setIndex((index + outfits.length - 1) % outfits.length)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  {outfits.map((_, i) => (
                    <button
                      key={i}
                      className={`pagination-dot ${i === index ? 'active' : ''}`}
                      aria-label={`第 ${i + 1} 套搭配`}
                      aria-current={i === index}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                  <button
                    className="icon-button"
                    aria-label="下一套"
                    onClick={() => setIndex((index + 1) % outfits.length)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="outfit-empty">
            <Shirt size={32} />
            <h3>{lockedId ? '这件单品，还在等合拍的伙伴' : '再添一件，就有更多可能'}</h3>
            <p>当前季节下还没有完整组合。试着补充上装、下装或外套，也可以在设置中调整季节。</p>
            {lockedId && (
              <button className="button secondary small" onClick={() => setLockedId('')}>
                取消锁定
              </button>
            )}
            <a href="/upload" className="text-link">
              添加衣物
              <ArrowRight size={15} />
            </a>
          </div>
        )}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FRESH IN YOUR CLOSET</p>
            <h2>最近收进的喜欢</h2>
          </div>
          <a className="text-link" href="/wardrobe">
            查看衣橱
            <ArrowRight size={15} />
          </a>
        </div>
        {items.length ? (
          <div className="garment-grid recent-grid">
            {items.slice(0, 4).map((g) => (
              <GarmentCard key={g.id} garment={g} />
            ))}
          </div>
        ) : (
          <a href="/upload" className="recent-empty">
            <span>
              <Plus size={24} />
            </span>
            <div>
              <h3>这里，留给你的下一件喜欢</h3>
              <p>上传照片，让心爱的单品拥有自己的位置。</p>
            </div>
            <ArrowUpRight size={21} />
          </a>
        )}
      </section>
      <div className="daily-note">
        <Flower2 size={23} strokeWidth={1.2} />
        <p>不必追赶每一种流行，穿成自己喜欢的样子就很好。</p>
        <span>A NOTE TO YOURSELF</span>
      </div>
    </div>
  );
}
