import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0B0E] p-6 text-center text-[#F5F5F7]">
      <AlertCircle className="mb-4 h-12 w-12 text-[#0A84FF]" />
      <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
      <p className="mt-2 text-sm text-neutral-400">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-[#0A84FF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
      >
        Return to Viewer
      </Link>
    </div>
  );
}
