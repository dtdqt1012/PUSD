/**
 * API Client for PUSD Backend API
 * Falls back to direct RPC calls if API is unavailable
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_TIMEOUT = 10000; // 10 seconds

export interface LotteryStats {
  totalTicketsSold: number;
  totalPrizesDistributed: string;
  totalBurned: string;
  biggestWin: string;
  lastUpdated?: number;
}

export interface TVLPoint {
  day: string;
  tvl: number;
  timestamp: number;
}

export interface TVLChartData {
  data: TVLPoint[];
  currentTVL: string;
  lastUpdated?: number;
}

/**
 * Fetch lottery stats from API
 */
export async function fetchLotteryStats(): Promise<LotteryStats | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    const response = await fetch(`${API_BASE_URL}/api/lottery/stats`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error: any) {
    // If API is unavailable, return null to fallback to direct RPC
    if (error.name === 'AbortError') {
      console.warn('API request timeout, falling back to direct RPC');
    } else {
      console.warn('API unavailable, falling back to direct RPC:', error.message);
    }
    return null;
  }
}

/**
 * WebSocket client for real-time updates
 */
export class LotteryStatsWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private listeners: Set<(data: LotteryStats) => void> = new Set();
  private isConnecting = false;

  constructor(private wsUrl: string) {}

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    const wsProtocol = this.wsUrl.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = this.wsUrl.replace(/^https?/, wsProtocol);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'stats' && message.data) {
            this.listeners.forEach((listener) => {
              listener(message.data);
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnecting = false;
        this.ws = null;
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max WebSocket reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    setTimeout(() => {
      console.log(`Attempting WebSocket reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  subscribe(listener: (data: LotteryStats) => void) {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.connect();
    }
  }

  unsubscribe(listener: (data: LotteryStats) => void) {
    this.listeners.delete(listener);
    if (this.listeners.size === 0 && this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}

// Singleton WebSocket instance
let wsClient: LotteryStatsWebSocket | null = null;

export function getLotteryStatsWebSocket(): LotteryStatsWebSocket {
  if (!wsClient) {
    wsClient = new LotteryStatsWebSocket(API_BASE_URL);
  }
  return wsClient;
}

/**
 * Fetch TVL chart data from API
 */
export async function fetchTVLChart(): Promise<TVLChartData | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    const response = await fetch(`${API_BASE_URL}/api/tvl/chart`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error: any) {
    // If API is unavailable, return null to fallback to direct RPC
    if (error.name === 'AbortError') {
      console.warn('TVL API request timeout, falling back to direct RPC');
    } else {
      console.warn('TVL API unavailable, falling back to direct RPC:', error.message);
    }
    return null;
  }
}

/**
 * WebSocket client for TVL updates
 */
export class TVLWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private listeners: Set<(data: TVLChartData) => void> = new Set();
  private isConnecting = false;

  constructor(private wsUrl: string) {}

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    const wsProtocol = this.wsUrl.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = this.wsUrl.replace(/^https?/, wsProtocol);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('TVL WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'tvl' && message.data) {
            this.listeners.forEach((listener) => {
              listener(message.data);
            });
          }
        } catch (error) {
          console.error('Error parsing TVL WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('TVL WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('TVL WebSocket disconnected');
        this.isConnecting = false;
        this.ws = null;
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error connecting TVL WebSocket:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max TVL WebSocket reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    setTimeout(() => {
      console.log(`Attempting TVL WebSocket reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  subscribe(listener: (data: TVLChartData) => void) {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.connect();
    }
  }

  unsubscribe(listener: (data: TVLChartData) => void) {
    this.listeners.delete(listener);
    if (this.listeners.size === 0 && this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}

// Singleton TVL WebSocket instance
let tvlWsClient: TVLWebSocket | null = null;

export function getTVLWebSocket(): TVLWebSocket {
  if (!tvlWsClient) {
    tvlWsClient = new TVLWebSocket(API_BASE_URL);
  }
  return tvlWsClient;
}

