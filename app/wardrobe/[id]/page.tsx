import ProtectedApp from '../../../components/protected-app';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProtectedApp view="wardrobe" id={(await params).id} />;
}
