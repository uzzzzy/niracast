import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

const ViewerPage = React.lazy(() => import('./pages/ViewerPage'));
const AdminPage = React.lazy(() => import('./pages/AdminPage'));

export function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0B0B0E] text-neutral-400">
          <div className="text-sm">Loading...</div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/watch/:id" element={<ViewerPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default App;
