import ProtectedApp from '../components/protected-app';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await searchParams).saved !== undefined) redirect('/favorites');
  return <ProtectedApp view="home" />;
}
