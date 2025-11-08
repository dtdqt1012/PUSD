import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import MainApp from './components/MainApp';
import Intro from './pages/Intro';
import Home from './pages/Home';
import Roadmap from './pages/Roadmap';
import FAQ from './pages/FAQ';
import Whitepaper from './pages/Whitepaper';
import './index.css';

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
            to="/roadmap" 
            className={`nav-link ${location.pathname === '/roadmap' ? 'active' : ''}`}
          >
            Roadmap
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
    <div className="layout">
      <Navigation />
      <main className="main-content-wrapper">
        {children}
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
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
          path="/roadmap" 
          element={
            <Layout>
              <Roadmap />
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
