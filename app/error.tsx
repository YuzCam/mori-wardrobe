'use client';
import { ErrorState } from '../components/ui/common';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <ErrorState message="页面暂时无法打开，你的衣橱数据仍然保留。" retry={reset} />
    </main>
  );
}
