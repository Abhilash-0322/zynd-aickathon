/* ─── User ─── */
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'candidate' | 'employer' | 'admin';
  avatar?: string;
  createdAt?: string;
}

/* ─── Job ─── */
export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  skills: string[];
  location: string;
  salary?: { min: number; max: number; currency: string };
  type: 'full-time' | 'part-time' | 'contract' | 'remote';
  postedBy: string;
  createdAt: string;
  updatedAt: string;
  status: 'open' | 'closed' | 'paused';
  applicantCount?: number;
}

/* ─── Application ─── */
export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  resumeText: string;
  coverLetter?: string;
  status: 'submitted' | 'processing' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted';
  pipelineResult?: PipelineResult;
  createdAt: string;
  updatedAt: string;
}

/* ─── Pipeline Result ─── */
export interface PipelineResult {
  sessionId: string;
  overallScore: number;
  biasScore: number;
  skillScore: number;
  credentialScore: number;
  privacyCompliant: boolean;
  matchScore: number;
  summary: string;
  agentResults: Record<string, AgentResult>;
  completedAt: string;
}

export interface AgentResult {
  agent: string;
  status: 'success' | 'warning' | 'error';
  score: number;
  details: string;
  flags?: string[];
  metadata?: Record<string, unknown>;
}

/* ─── Pipeline Event (real-time) ─── */
export interface PipelineEvent {
  id: string;
  sessionId: string;
  agent: string;
  type: 'started' | 'processing' | 'completed' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

/* ─── Agent ─── */
export interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'bias_detector' | 'skill_verifier' | 'credential_agent' | 'privacy_agent' | 'candidate_matcher' | 'orchestrator';
  icon: string;
}

export type AgentStatusValue = 'idle' | 'processing' | 'completed' | 'error';

export interface AgentStatus {
  agent: string;
  status: AgentStatusValue;
  lastUpdated: string;
}

/* ─── WebSocket Messages ─── */
export type WebSocketMessage =
  | { type: 'pipeline_event'; payload: PipelineEvent }
  | { type: 'agent_status'; payload: AgentStatus }
  | { type: 'session_started'; payload: { sessionId: string } }
  | { type: 'session_completed'; payload: { sessionId: string; result: PipelineResult } }
  | { type: 'error'; payload: { message: string; code?: string } }
  | { type: 'heartbeat'; payload: { timestamp: string } };
