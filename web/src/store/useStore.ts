import { create } from 'zustand';
import type { User, Application, Job, PipelineEvent } from '@/types';

/* ─── State Shape ─── */
interface StoreState {
  /* auth */
  user: User | null;
  isAuthenticated: boolean;

  /* websocket */
  wsStatus: 'connected' | 'disconnected' | 'reconnecting';

  /* data */
  applications: Application[];
  jobs: Job[];
  pipelineEvents: PipelineEvent[];

  /* session */
  activeSession: string | null;
  agentStatuses: Record<string, string>;

  /* actions */
  setUser: (user: User) => void;
  logout: () => void;
  setWsStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
  addApplication: (app: Application) => void;
  setApplications: (apps: Application[]) => void;
  setJobs: (jobs: Job[]) => void;
  addPipelineEvent: (event: PipelineEvent) => void;
  clearPipelineEvents: () => void;
  setActiveSession: (sessionId: string | null) => void;
  setAgentStatus: (agent: string, status: string) => void;
  resetAgentStatuses: () => void;
}

/* ─── Store ─── */
export const useStore = create<StoreState>((set) => ({
  /* initial state */
  user: null,
  isAuthenticated: false,
  wsStatus: 'disconnected',
  applications: [],
  jobs: [],
  pipelineEvents: [],
  activeSession: null,
  agentStatuses: {},

  /* actions */
  setUser: (user) => set({ user, isAuthenticated: true }),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
      applications: [],
      pipelineEvents: [],
      activeSession: null,
      agentStatuses: {},
    }),

  setWsStatus: (wsStatus) => set({ wsStatus }),

  addApplication: (app) =>
    set((state) => ({ applications: [app, ...state.applications] })),

  setApplications: (applications) => set({ applications }),

  setJobs: (jobs) => set({ jobs }),

  addPipelineEvent: (event) =>
    set((state) => ({
      pipelineEvents: [...state.pipelineEvents, event],
    })),

  clearPipelineEvents: () => set({ pipelineEvents: [] }),

  setActiveSession: (activeSession) => set({ activeSession }),

  setAgentStatus: (agent, status) =>
    set((state) => ({
      agentStatuses: { ...state.agentStatuses, [agent]: status },
    })),

  resetAgentStatuses: () => set({ agentStatuses: {} }),
}));
