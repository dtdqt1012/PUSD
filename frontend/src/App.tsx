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
            to="/whitepaper" 
            className={`nav-link ${location.pathname === '/whitepaper' ? 'active' : ''}`}
          >
            Whitepaper
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
        </div>
      </div>
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="layout">
        <Navigation />
        <main className="main-content-wrapper">
          {children}
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
