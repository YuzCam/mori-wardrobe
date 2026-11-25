import ProtectedApp from '../../components/protected-app';
export const dynamic = 'force-dynamic';
export const metadata = { title: '收藏的搭配 · 沐衣 MŌRI' };
export default function Page() {
  return <ProtectedApp view="favorites" />;
}
