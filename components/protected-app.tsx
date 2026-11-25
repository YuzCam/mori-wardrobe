import { requireChatGPTUser } from '../app/chatgpt-auth';
import Shell, { type View } from './layout/shell';
import Dashboard from '../features/dashboard/dashboard';
import Wardrobe from '../features/wardrobe/wardrobe';
import Upload from '../features/upload/upload';
import Favorites from '../features/outfits/favorites';
export default async function ProtectedApp({ view, id }: { view: View; id?: string }) {
  const user = await requireChatGPTUser(view === 'home' ? '/' : `/${view}`);
  return (
    <Shell view={view} owner={user.userId}>
      {view === 'home' ? (
        <Dashboard owner={user.userId} />
      ) : view === 'wardrobe' ? (
        <Wardrobe owner={user.userId} initialId={id} />
      ) : view === 'favorites' ? (
        <Favorites owner={user.userId} />
      ) : (
        <Upload owner={user.userId} />
      )}
    </Shell>
  );
}
