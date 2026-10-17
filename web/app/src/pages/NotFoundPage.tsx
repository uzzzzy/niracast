import { Link } from 'react-router';
import notFoundArt from '../assets/not-found.webp';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6 text-fg">
      <EmptyState
        art={notFoundArt}
        title="404 - Page Not Found"
        description="The page you are looking for does not exist."
        action={
          <Link
            to="/"
            className="inline-flex items-center justify-center font-medium rounded-control transition-colors select-none cursor-pointer bg-accent text-white hover:bg-accent/90 h-9 px-3.5 text-sm mobile:min-h-11"
          >
            Return to Viewer
          </Link>
        }
      />
    </div>
  );
}
