'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  Sun,
  CloudSun,
  CloudRain,
  Cloud,
  Snowflake,
  Wind,
  ArrowUpRight,
  Navigation,
  Search,
  LoaderCircle,
  Thermometer,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../../components/ui/modal';
import { api, patch } from '../../lib/client/api';
import { usePreferences } from '../wardrobe/hooks';
import type { Preferences, Weather } from '../../types/wardrobe';
export function weatherLabel(code: number) {
  return code === 0
    ? '晴朗'
    : code <= 3
      ? '多云'
      : code <= 48
        ? '有雾'
        : code >= 71 && code <= 77
          ? '降雪'
          : code >= 95
            ? '雷雨'
            : '有雨';
}
export function WeatherIcon({ code, size = 48 }: { code: number; size?: number }) {
  const Icon =
    code === 0
      ? Sun
      : code <= 3
        ? CloudSun
        : code <= 48
          ? Cloud
          : code >= 71 && code <= 77
            ? Snowflake
            : CloudRain;
  return <Icon size={size} strokeWidth={1.2} />;
}
export function useWeather(owner: string) {
  const { data: prefs } = usePreferences(owner);
  const [manual, setManual] = useState<Weather | null>(null);
  const query = useQuery({
    queryKey: ['weather', owner, prefs?.latitude, prefs?.longitude],
    queryFn: () =>
      api<Weather>(
        `/api/weather?lat=${prefs!.latitude}&lon=${prefs!.longitude}&city=${encodeURIComponent(prefs!.city)}`,
      ),
    enabled: prefs?.latitude != null && prefs?.longitude != null,
    staleTime: 1800000,
    retry: 0,
  });
  useEffect(() => {
    setManual(null);
  }, [prefs?.latitude, prefs?.longitude]);
  return { ...query, weather: manual ?? query.data, setManual, prefs };
}
export function WeatherCard({
  owner,
  state,
}: {
  owner: string;
  state: ReturnType<typeof useWeather>;
}) {
  const [cityOpen, setCityOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const weather = state.weather;
  return (
    <>
      <section className="weather-card">
        <div className="weather-top">
          <span>
            <MapPin size={14} />
            {weather?.city || state.prefs?.city || '选择你的城市'}
          </span>
          <button
            className="icon-button"
            onClick={() => setCityOpen(true)}
            aria-label="更换天气城市"
          >
            <ArrowUpRight size={17} />
          </button>
        </div>
        {weather ? (
          <>
            <div className="weather-current">
              <div>
                <strong>
                  {Math.round(weather.temperature)}
                  <sup>°</sup>
                </strong>
                <span>
                  {weatherLabel(weather.code)}
                  <small>体感 {Math.round(weather.apparent)}°</small>
                </span>
              </div>
              <div className="weather-symbol">
                <WeatherIcon code={weather.code} size={57} />
              </div>
            </div>
            <div className="weather-range">
              <span>
                {Math.round(weather.min)}° / {Math.round(weather.max)}°
              </span>
              <span>
                <CloudRain size={13} />
                降雨 {weather.rain}%
              </span>
            </div>
            <div className="weather-advice">
              <span className="tiny-dot" />
              {weather.apparent < 17
                ? '今天有点凉，记得带件外套。'
                : weather.apparent >= 27
                  ? '清爽透气，是今天的小秘诀。'
                  : '温度刚刚好，穿得轻松一点。'}
            </div>
            <p className="weather-source">
              {weather.manual ? (
                '手动设置'
              ) : (
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Open-Meteo
                </a>
              )}{' '}
              ·{' '}
              {new Date(weather.updatedAt).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              <button onClick={() => setManualOpen(true)} className="text-link">
                调整
              </button>
            </p>
          </>
        ) : state.isFetching ? (
          <div className="weather-empty" role="status">
            <LoaderCircle className="spin" />
            <p>正在看看今天的天气…</p>
          </div>
        ) : (
          <div className="weather-empty">
            <CloudSun size={48} strokeWidth={1.1} />
            <h3>{state.error ? '天气暂时没有送达' : '把天气也考虑进去'}</h3>
            <p>
              {state.error
                ? '可手动设置，继续挑选今天的穿搭。'
                : '选择城市，找到更适合今天的搭配。'}
            </p>
            <button
              className="button secondary small"
              onClick={() => (state.error ? setManualOpen(true) : setCityOpen(true))}
            >
              {state.error ? '手动设置' : '选择城市'}
              <ArrowUpRight size={14} />
            </button>
            {state.error && (
              <button className="text-link" onClick={() => state.refetch()}>
                重新获取
              </button>
            )}
          </div>
        )}
      </section>
      {cityOpen && <CityPicker owner={owner} onClose={() => setCityOpen(false)} />}{' '}
      {manualOpen && (
        <ManualWeather
          current={weather}
          onClose={() => setManualOpen(false)}
          onSave={(w) => {
            state.setManual(w);
            setManualOpen(false);
            toast.success('已按你设置的天气推荐');
          }}
        />
      )}
    </>
  );
}
export function CityPicker({ owner, onClose }: { owner: string; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<
    { city: string; region: string; latitude: number; longitude: number }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const { data: prefs } = usePreferences(owner);
  const client = useQueryClient();
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ items: typeof results }>(
        `/api/weather?search=${encodeURIComponent(term.trim())}`,
      );
      setResults(r.items);
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(city: string, latitude: number, longitude: number) {
    if (!prefs) return;
    setBusy(true);
    setError('');
    try {
      await patch('/api/preferences', { ...prefs, city, latitude, longitude });
      await client.invalidateQueries({ queryKey: ['preferences', owner] });
      onClose();
      toast.success(`天气城市已设为${city}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setError('当前浏览器不支持定位，请搜索城市');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        select(
          '当前位置',
          Math.round(p.coords.latitude * 100) / 100,
          Math.round(p.coords.longitude * 100) / 100,
        ),
      () => {
        setBusy(false);
        setError('未能获取位置，请允许位置权限或直接搜索城市');
      },
      { enableHighAccuracy: false, timeout: 12000 },
    );
  }
  return (
    <Modal title="你在哪里，天气就在哪里" onClose={() => !busy && onClose()}>
      <p className="hint">定位仅在点击后请求，也可以直接搜索城市。</p>
      <form onSubmit={search} className="city-search">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="输入城市，例如：北京 / Shanghai"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="城市名称"
          />
        </label>
        <button className="button primary" disabled={busy || !term.trim()}>
          {busy ? <LoaderCircle className="spin" size={17} /> : '搜索'}
        </button>
      </form>
      <button className="location-button" onClick={locate} disabled={busy}>
        <Navigation size={17} />
        使用当前位置
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="city-results">
        {results.map((c, i) => (
          <button key={i} onClick={() => select(c.city, c.latitude, c.longitude)} disabled={busy}>
            <MapPin size={18} />
            <span>
              <strong>{c.city}</strong>
              <small>{c.region}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {searched && !results.length && <p>没有找到这个城市，请尝试拼音或英文名称。</p>}
      </div>
    </Modal>
  );
}
function ManualWeather({
  current,
  onSave,
  onClose,
}: {
  current?: Weather;
  onSave: (w: Weather) => void;
  onClose: () => void;
}) {
  const [temperature, setTemperature] = useState(current?.apparent ?? 20);
  const [code, setCode] = useState(current?.code ?? 1);
  return (
    <Modal title="按你感受到的天气来" onClose={onClose}>
      <label className="field-label" htmlFor="manual-temperature">
        体感温度
      </label>
      <div className="manual-temperature">
        <Thermometer size={25} />
        <input
          id="manual-temperature"
          type="number"
          min={-40}
          max={50}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
        />
        <span>°C</span>
      </div>
      <div className="chip-group">
        {[
          { id: 0, name: '晴朗' },
          { id: 2, name: '多云' },
          { id: 61, name: '有雨' },
          { id: 73, name: '降雪' },
        ].map((c) => (
          <button
            key={c.id}
            className={`chip ${code === c.id ? 'selected' : ''}`}
            onClick={() => setCode(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="hint">本次页面使用手动天气，重新打开后会恢复城市天气。</p>
      <div className="modal-actions">
        <button
          className="button primary"
          disabled={!Number.isFinite(temperature) || temperature < -40 || temperature > 50}
          onClick={() =>
            onSave({
              city: current?.city || '我的天气',
              latitude: 0,
              longitude: 0,
              temperature,
              apparent: temperature,
              min: temperature,
              max: temperature,
              rain: code >= 50 ? 100 : 0,
              code,
              updatedAt: new Date().toISOString(),
              manual: true,
            })
          }
        >
          使用这个天气
        </button>
      </div>
    </Modal>
  );
}
