export default function LoadingSkeleton() {
  return (
    <div className="section">
      <div className="skeleton skeleton-large" style={{ marginBottom: '1.5rem' }}></div>
      <div className="skeleton skeleton-large" style={{ marginBottom: '1rem' }}></div>
      <div className="skeleton skeleton-large" style={{ marginBottom: '1rem' }}></div>
      <div className="skeleton skeleton-large"></div>
    </div>
  );
}

