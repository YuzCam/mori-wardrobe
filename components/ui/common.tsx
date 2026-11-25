'use client';
import { LoaderCircle, AlertCircle, ArrowRight, Shirt, Sparkles } from 'lucide-react';
export function Loading({ text = '正在整理你的衣橱…' }: { text?: string }) {
  return (
    <div className="loading-box" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{text}</span>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          再试一次
        </button>
      )}
      <a href="/signin-with-chatgpt?return_to=/" target="_top" className="text-link">
        重新登录
      </a>
    </div>
  );
}
export function EmptyWardrobe({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`empty-wardrobe ${compact ? 'compact' : ''}`}>
      <div className="empty-art">
        <Shirt size={52} strokeWidth={1.1} />
        <span>
          <Sparkles size={15} />
        </span>
      </div>
      <h3>让喜欢的衣服，在这里相遇</h3>
      <p>从第一件开始，慢慢收藏属于你的日常。</p>
      <a className="button primary" href="/upload">
        添加第一件衣物
        <ArrowRight size={16} />
      </a>
      <small>拍照或从相册选择，一件一件整理就好</small>
    </div>
  );
}
export const toggle = (values: string[], value: string) =>
  values.includes(value) ? values.filter((x) => x !== value) : [...values, value];
