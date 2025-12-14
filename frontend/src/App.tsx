import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { NotificationProvider } from './contexts/NotificationContext';
import MainApp from './components/MainApp';
import './index.css';

// Lazy load pages for better performance
const Intro = lazy(() => import('./pages/Intro'));
const Home = lazy(() => import('./pages/Home'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Whitepaper = lazy(() => import('./pages/Whitepaper'));
const PFUN = lazy(() => import('./pages/PFUN'));
const Lottery = lazy(() => import('./pages/Lottery'));

// Loading fallback component
const PageLoader = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    minHeight: '100vh',
    color: '#8247e5'
  }}>
    <div>Loading...</div>
  </div>
);

function Navigation() {
  const location = useLocation();

  return (
    <nav className="main-nav">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <span className="terminal-prompt">&gt;</span> POLYGON USD
        </Link>
        <div className="nav-links">
          <Link 
            to="/home" 
            className={`nav-link ${location.pathname === '/home' ? 'active' : ''}`}
          >
            Home
          </Link>
          <Link 
            to="/faq" 
            className={`nav-link ${location.pathname === '/faq' ? 'active' : ''}`}
          >
            FAQ
          </Link>
          <Link 
            to="/pfun" 
            className={`nav-link ${location.pathname === '/pfun' ? 'active' : ''}`}
          >
            PFUN
          </Link>
          <Link 
            to="/lottery" 
            className={`nav-link ${location.pathname === '/lottery' ? 'active' : ''}`}
          >
            Lottery
          </Link>
          <Link to="/app" className="nav-link nav-link-app">
            PUSD App
          </Link>
          <Link 
            to="/whitepaper" 
            className={`nav-link ${location.pathname === '/whitepaper' ? 'active' : ''}`}
          >
            Whitepaper
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer style={{
      marginTop: '3rem',
      padding: '2rem',
      borderTop: '1px solid rgba(0, 255, 0, 0.2)',
      textAlign: 'center',
      color: '#00ff00',
      fontFamily: 'Courier New, monospace'
    }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <a 
          href="mailto:tdat@gjteam.org"
          style={{
            color: '#00ff00',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          tdat@gjteam.org
        </a>
        <span style={{ opacity: 0.5 }}>|</span>
        <a 
          href="https://x.com/_PUSD" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            color: '#00ff00',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          X
        </a>
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
        PUSD - Polygon's Native Stablecoin
      </div>
    </footer>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="layout">
        <Navigation />
        <main className="main-content-wrapper">
          {children}
          <Footer />
        </main>
      </div>
    </NotificationProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/app" element={<MainApp />} />
          <Route path="/intro" element={<Intro />} />
          <Route path="/" element={<Navigate to="/intro" replace />} />
          <Route 
            path="/home" 
            element={
              <Layout>
                <Home />
              </Layout>
            } 
          />
          <Route 
            path="/faq" 
            element={
              <Layout>
                <FAQ />
              </Layout>
            } 
          />
          <Route 
            path="/whitepaper" 
            element={
              <Layout>
                <Whitepaper />
              </Layout>
            } 
          />
          <Route 
            path="/pfun" 
            element={
              <Layout>
                <PFUN />
              </Layout>
            } 
          />
          <Route 
            path="/pfun/:tokenAddress" 
            element={
              <Layout>
                <PFUN />
              </Layout>
            } 
          />
          <Route 
            path="/lottery" 
            element={
              <Layout>
                <Lottery />
              </Layout>
            } 
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
