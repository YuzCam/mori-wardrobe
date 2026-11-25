'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MapPin,
  ArrowUpRight,
  Download,
  Upload,
  LoaderCircle,
  ShieldCheck,
  LogOut,
  Check,
  Sun,
  Snowflake,
  Database,
  Trash2,
} from 'lucide-react';
import Modal from '../../components/ui/modal';
import { usePreferences, useRefreshWardrobe } from '../wardrobe/hooks';
import { CityPicker } from '../weather/weather';
import { patch } from '../../lib/client/api';
import type { Preferences } from '../../types/wardrobe';
import { Loading } from '../../components/ui/common';
import { exportBackup, inspectBackup, importBackup } from './backup';
import { clearPrivateData } from '../../lib/client/draft-store';
export default function SettingsPanel({ owner, onClose }: { owner: string; onClose: () => void }) {
  const { data: prefs, error } = usePreferences(owner);
  const [cityOpen, setCityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [backup, setBackup] = useState<Awaited<ReturnType<typeof inspectBackup>> | null>(null);
  const [restorePrefs, setRestorePrefs] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const refresh = useRefreshWardrobe(owner);
  async function update(value: Partial<Preferences>) {
    if (!prefs) return;
    setBusy(true);
    try {
      await patch('/api/preferences', { ...prefs, ...value });
      await client.invalidateQueries({ queryKey: ['preferences', owner] });
      toast.success('偏好已更新');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setProgress('正在准备完整备份');
    try {
      await exportBackup(setProgress);
      toast.success('备份已生成，包含单品图片和穿搭记录');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  async function inspect(file?: File) {
    if (!file) return;
    setBusy(true);
    setProgress('正在校验备份');
    try {
      setBackup(await inspectBackup(file));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setProgress('');
      if (input.current) input.current.value = '';
    }
  }
  async function restore() {
    if (!backup) return;
    setBusy(true);
    try {
      await importBackup(backup, restorePrefs, setProgress);
      await refresh();
      await client.invalidateQueries({ queryKey: ['preferences', owner] });
      toast.success('备份已恢复到衣橱');
      setBackup(null);
    } catch (e) {
      await refresh();
      toast.error((e as Error).message, { duration: 10000 });
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  async function logout() {
    await clearPrivateData().catch(() => {});
    client.clear();
    location.href = '/signout-with-chatgpt?return_to=/';
  }
  return (
    <>
      <Modal title="给衣橱一点个人偏好" onClose={() => !busy && onClose()}>
        {!prefs ? (
          error ? (
            <p className="inline-error">{error.message}</p>
          ) : (
            <Loading />
          )
        ) : (
          <>
            <div className="settings-section">
              <h3>所在城市</h3>
              <button className="settings-row" onClick={() => setCityOpen(true)} disabled={busy}>
                <MapPin size={19} />
                <span>
                  {prefs.city || '还没有选择城市'}
                  <small>用于天气和每日搭配建议</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="settings-section">
              <h3>当前衣橱季节</h3>
              <p className="hint">没有天气信息时，按这个季节推荐。</p>
              <div className="segmented-control">
                {[
                  { id: 'winter', name: '冬季', icon: Snowflake },
                  { id: 'summer', name: '夏季', icon: Sun },
                ].map((s) => (
                  <button
                    key={s.id}
                    className={prefs.season === s.id ? 'active' : ''}
                    onClick={() => update({ season: s.id as 'winter' | 'summer' })}
                    disabled={busy}
                  >
                    <s.icon size={16} />
                    {s.name}
                    {prefs.season === s.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h3>界面颜色</h3>
              <div className="chip-group">
                {[
                  { id: 'seasonal', name: '跟随季节' },
                  { id: 'winter', name: '暖冬燕麦' },
                  { id: 'summer', name: '清夏薄荷' },
                ].map((t) => (
                  <button
                    key={t.id}
                    className={`chip ${prefs.theme === t.id ? 'selected' : ''}`}
                    onClick={() => update({ theme: t.id as Preferences['theme'] })}
                    disabled={busy}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h3>数据与备份</h3>
              <p className="hint">完整备份包含图片、标签和穿搭；单次图片总量支持 80MB。</p>
              <div className="backup-buttons">
                <button className="button secondary" onClick={download} disabled={busy}>
                  <Download size={17} />
                  导出完整备份
                </button>
                <button
                  className="button secondary"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  <Upload size={17} />
                  恢复备份
                </button>
              </div>
              {backup && (
                <div className="backup-confirm">
                  <strong>
                    已校验：{backup.manifest.garments.length} 件衣物，
                    {backup.manifest.outfits.length} 套搭配
                  </strong>
                  <p>将补充到当前衣橱。重复恢复同一备份不会重复添加衣物。</p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={restorePrefs}
                      onChange={(e) => setRestorePrefs(e.target.checked)}
                      disabled={busy}
                    />
                    同时恢复备份中的城市和界面设置
                  </label>
                  <div className="modal-actions">
                    <button
                      className="button secondary small"
                      onClick={() => setBackup(null)}
                      disabled={busy}
                    >
                      取消
                    </button>
                    <button className="button primary small" onClick={restore} disabled={busy}>
                      开始恢复
                    </button>
                  </div>
                </div>
              )}
              {progress && (
                <p className="backup-progress" role="status">
                  <LoaderCircle className="spin" size={15} />
                  {progress}
                </p>
              )}
              <button
                className="text-link muted-link"
                disabled={busy}
                onClick={async () => {
                  if ('caches' in window)
                    for (const key of await caches.keys())
                      if (key.startsWith('mori-models')) await caches.delete(key);
                  toast.success('已清理本机识别缓存，下次使用会重新下载');
                }}
              >
                <Trash2 size={13} />
                清理本机识别缓存
              </button>
            </div>
            <div className="settings-privacy">
              <ShieldCheck size={19} />
              <p>这是你的私人衣橱。照片在设备上处理，确认保存后上传，图片仅向所属登录用户提供。</p>
            </div>
            <button className="button secondary logout-button" onClick={logout} disabled={busy}>
              <LogOut size={16} />
              退出登录
            </button>
          </>
        )}
        <input
          type="file"
          ref={input}
          accept=".zip,application/zip"
          className="visually-hidden"
          onChange={(e) => inspect(e.target.files?.[0])}
          aria-label="选择衣橱备份文件"
        />
      </Modal>
      {cityOpen && <CityPicker owner={owner} onClose={() => setCityOpen(false)} />}
    </>
  );
}
