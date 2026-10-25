import { useEffect, useState } from 'react';
import { renderMode } from './engine/renderSync';
import { RenderView } from './RenderView';
import { Home } from './Home';
import { Editor } from './editor/Editor';

function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  if (renderMode) return <RenderView />;
  const m = /^#\/p\/([\w-]+)/.exec(hash);
  if (m) return <Editor key={m[1]} projectId={m[1]} />;
  return <Home />;
}
