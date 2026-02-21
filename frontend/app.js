/* Fair Hiring Network — app.js
   Real-time WebSocket client + UI logic */

// ── Config ───────────────────────────────────────────────────────────────────
const API = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';

// ── State ────────────────────────────────────────────────────────────────────
let ws = null;
let wsRetries = 0;
const MAX_RETRIES = 10;

const state = {
  activeSession: null,     // current conversation_id being tracked
  events: [],
  applications: [],
  jobs: [],
  agentStatus: {},         // agentName → last status
  activePipelineSteps: new Set(),
};

// Agent definitions for the network visualization
const AGENTS = [
  { id: 'orchestrator', name: 'Orchestrator',         icon: '🎯', port: 5001, color: '#7c3aed', role: 'Coordinates pipeline' },
  { id: 'privacy',      name: 'Privacy Guardian',     icon: '🔒', port: 5005, color: '#06b6d4', role: 'Anonymizes profiles' },
  { id: 'bias',         name: 'Bias Detector',        icon: '⚖️', port: 5003, color: '#f59e0b', role: 'Scans for bias' },
  { id: 'skill',        name: 'Skill Verifier',       icon: '🎯', port: 5002, color: '#10b981', role: 'Verifies skills' },
  { id: 'matcher',      name: 'Candidate Matcher',    icon: '🔗', port: 5004, color: '#a78bfa', role: 'Calculates match' },
  { id: 'credential',   name: 'Credential Issuer',    icon: '📜', port: 5006, color: '#ef4444', role: 'Issues VCs' },
];

// Map agent event names → AGENTS ids
const AGENT_NAME_MAP = {
  'Orchestrator Agent':       'orchestrator',
  'Privacy Guardian Agent':   'privacy',
  'Bias Detector Agent':      'bias',
  'Skill Verifier Agent':     'skill',
  'Candidate Matcher Agent':  'matcher',
  'Credential Issuer Agent':  'credential',
};

// Map agent names → pipeline step element ids
const STEP_MAP = {
  'Privacy Guardian Agent':  'step-privacy',
  'Bias Detector Agent':     'step-bias',
  'Skill Verifier Agent':    'step-skill',
  'Candidate Matcher Agent': 'step-match',
  'Credential Issuer Agent': 'step-cred',
};

// ── WebSocket ────────────────────────────────────────────────────────────────

function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch(e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    wsRetries = 0;
    setWsStatus('connected');
    console.log('[WS] Connected');
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      handleWsMessage(msg);
    } catch(e) { /* ignore malformed */ }
  };

  ws.onclose = () => {
    setWsStatus('disconnected');
    scheduleReconnect();
  };

  ws.onerror = () => {
    setWsStatus('error');
  };
}

function scheduleReconnect() {
  if (wsRetries >= MAX_RETRIES) return;
  wsRetries++;
  const delay = Math.min(1000 * wsRetries, 10000);
  setTimeout(connectWS, delay);
  setWsStatus('reconnecting');
}

function setWsStatus(status) {
  const el = document.getElementById('ws-status');
  if (!el) return;
  const labels = {
    connected:    '🟢 Live',
    disconnected: '🔴 Disconnected',
    reconnecting: '🟡 Reconnecting…',
    error:        '🔴 Error',
  };
  el.textContent = labels[status] || status;
  el.className = `badge badge-${status === 'connected' ? 'online' : 'offline'}`;
}

// ── Centralized token-streaming state ────────────────────────────────────────

const tokenState = {
  // agentName → { box: <element>, buffer: '' }
  boxes: {},
};

function getOrCreateThinkingBox(agentName) {
  if (tokenState.boxes[agentName]) return tokenState.boxes[agentName];

  const log = document.getElementById('activity-log');
  if (!log) return null;

  const wrap = document.createElement('div');
  wrap.className = 'thinking-box';
  wrap.dataset.agent = agentName;

  const header = document.createElement('div');
  header.className = 'thinking-header';
  header.innerHTML = `<span class="thinking-agent">${agentName}</span><span class="thinking-badge">thinking…</span>`;

  const content = document.createElement('pre');
  content.className = 'thinking-content';
  content.textContent = '';

  wrap.appendChild(header);
  wrap.appendChild(content);
  log.appendChild(wrap);

  const auto = document.getElementById('auto-scroll');
  if (auto?.checked) log.scrollTop = log.scrollHeight;

  tokenState.boxes[agentName] = { box: wrap, content, buffer: '' };
  return tokenState.boxes[agentName];
}

function appendToken(agentName, token) {
  const entry = getOrCreateThinkingBox(agentName);
  if (!entry) return;
  entry.buffer += token;
  entry.content.textContent = entry.buffer;

  const log = document.getElementById('activity-log');
  const auto = document.getElementById('auto-scroll');
  if (auto?.checked && log) log.scrollTop = log.scrollHeight;
}

function finalizeThinkingBox(agentName) {
  const entry = tokenState.boxes[agentName];
  if (!entry) return;
  const badge = entry.box.querySelector('.thinking-badge');
  if (badge) { badge.textContent = 'done'; badge.className = 'thinking-badge done'; }
  delete tokenState.boxes[agentName];
}

// ── Message handling ──────────────────────────────────────────────────────────

function handleWsMessage(msg) {
  const p = msg.payload || {};

  switch (msg.type) {

    // ── Centralized server events ───────────────────────────────────────────

    case 'connection_established':
      if (p.jobs)    state.jobs = p.jobs;
      if (p.results) { /* count */ }
      markAllAgentsOnline();
      appendLogEntry({ event_type: 'connected', agent_name: 'Server',
        step: `✅ Connected (centralized mode) — ${(p.jobs||[]).length} jobs loaded`,
        status: 'info', timestamp: msg.timestamp });
      break;

    case 'pipeline_event':
      if (p.status === 'started') {
        state.activeSession = p.conversation_id;
        Object.keys(tokenState.boxes).forEach(k => delete tokenState.boxes[k]);
        showPipelineProgress();
        switchToTab('live-tab');
      } else if (p.status === 'completed') {
        onPipelineResultCentralized(p);
        markAllAgentsOnline();
      }
      appendLogEntry({ event_type: 'pipeline_event', agent_name: 'Pipeline',
        step: p.message || p.status, status: p.status === 'completed' ? 'completed' : 'info',
        conversation_id: p.conversation_id, timestamp: msg.timestamp });
      break;

    case 'step':
      updatePipelineStepByAgent(p.agent_name, 'active');
      setAgentStatusByName(p.agent_name, 'active');
      appendLogEntry({ event_type: 'step', agent_name: p.agent_name,
        step: p.step || p.message || '…',
        status: 'processing', conversation_id: p.conversation_id,
        timestamp: msg.timestamp });
      pulseNetworkNodeByName(p.agent_name);
      break;

    case 'thinking_start':
      getOrCreateThinkingBox(p.agent_name);
      setAgentStatusByName(p.agent_name, 'thinking');
      break;

    case 'token':
      appendToken(p.agent_name, p.token || '');
      break;

    case 'thinking_end':
      finalizeThinkingBox(p.agent_name);
      setAgentStatusByName(p.agent_name, 'online');
      break;

    case 'result':
      updatePipelineStepByAgent(p.agent_name, 'done');
      setAgentStatusByName(p.agent_name, 'online');
      appendLogEntry({ event_type: 'result', agent_name: p.agent_name,
        step: p.step || p.message || 'Result received',
        status: 'completed', conversation_id: p.conversation_id,
        timestamp: msg.timestamp });
      break;

    case 'error':
      appendLogEntry({ event_type: 'error', agent_name: p.agent_name || 'System',
        step: p.message || 'An error occurred',
        status: 'error', conversation_id: p.conversation_id,
        timestamp: msg.timestamp });
      break;

    // ── Distributed server events (backwards compat) ────────────────────────

    case 'connected':
      if (p.recent_events) p.recent_events.forEach(ev => appendLogEntry(ev));
      if (p.applications)  state.applications = p.applications;
      break;

    case 'agent_event':
      handleAgentEvent(p);
      break;

    case 'application_received':
      onApplicationReceived(p);
      break;

    case 'pipeline_result':
      onPipelineResult(p);
      break;

    case 'pong':
    case 'heartbeat':
      break;
  }
}

// ── Centralized result handler ────────────────────────────────────────────────

function onPipelineResultCentralized(payload) {
  const results = payload.results || {};

  // Build a result object matching renderResultCard expectations
  const result = {
    privacy_analysis:   { privacy_score: results.privacy_score },
    bias_detection:     { bias_free_score: results.bias_free_score },
    skill_verification: { overall_skill_score: results.skill_score },
    matching:           { match_score: results.match_score, recommendation: results.recommendation,
                          skill_gaps: results.skill_gaps || [], strengths: results.key_strengths || [] },
    final_decision:     {
      final_recommendation: results.final_decision,
      overall_score:        results.overall_score,
      confidence:           results.confidence,
      executive_summary:    results.executive_summary,
      key_strengths:        results.key_strengths || [],
      next_steps:           results.next_steps || [],
      fairness_guarantee:   results.fairness_guarantee || '',
    },
    credential_issuance: {
      credential_id:   results.credential_id   || '',
      claims_hash:     results.claims_hash      || '',
    },
  };

  renderResultCard(payload.conversation_id, result);

  const btn = document.getElementById('submit-btn');
  if (btn) { btn.disabled = false; btn.textContent = '🚀 Submit to Fair Hiring Pipeline'; }

  ['step-privacy','step-bias','step-skill','step-match','step-cred'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.classList.add('done');
      const badge = el.querySelector('.step-status');
      if (badge) { badge.textContent = 'done'; badge.className = 'step-status badge badge-completed'; }
    }
  });
}

// ── Helper: lookup pipeline step by agent name ────────────────────────────────

// ── Agent card status helpers ────────────────────────────────────────────────

// Maps centralized agent names → AGENTS[].id
const CENTRALIZED_AGENT_ID_MAP = {
  'Privacy Guardian':  'privacy',
  'Bias Detector':     'bias',
  'Skill Verifier':    'skill',
  'Candidate Matcher': 'matcher',
  'Credential Issuer': 'credential',
  'Orchestrator':      'orchestrator',
};

function resolveAgentId(agentName) {
  if (!agentName) return null;
  // Direct lookup (centralized names)
  if (CENTRALIZED_AGENT_ID_MAP[agentName]) return CENTRALIZED_AGENT_ID_MAP[agentName];
  // Distributed names (with 'Agent' suffix) — fallback
  const clean = agentName.replace(' Agent', '');
  if (CENTRALIZED_AGENT_ID_MAP[clean]) return CENTRALIZED_AGENT_ID_MAP[clean];
  // Partial match
  for (const [key, id] of Object.entries(CENTRALIZED_AGENT_ID_MAP)) {
    if (agentName.includes(key) || key.includes(agentName)) return id;
  }
  return null;
}

function setAgentStatusByName(agentName, status) {
  const agentId = resolveAgentId(agentName);
  if (!agentId) return;
  state.agentStatus[agentId] = status;
  updateAgentCard(agentId, status);
  updateOnlineCount();
}

function markAllAgentsOnline() {
  AGENTS.forEach(ag => {
    state.agentStatus[ag.id] = 'online';
    updateAgentCard(ag.id, 'online');
  });
  updateOnlineCount();
}

const AGENT_STEP_MAP = {
  'Privacy Guardian':  'step-privacy',
  'Bias Detector':     'step-bias',
  'Skill Verifier':    'step-skill',
  'Candidate Matcher': 'step-match',
  'Credential Issuer': 'step-cred',
  'Orchestrator':      null,
};

function updatePipelineStepByAgent(agentName, status) {
  // Try exact then partial match
  let stepId = AGENT_STEP_MAP[agentName];
  if (!stepId) {
    for (const [key, val] of Object.entries(AGENT_STEP_MAP)) {
      if (agentName.includes(key)) { stepId = val; break; }
    }
  }
  if (!stepId) return;
  const el = document.getElementById(stepId);
  if (!el) return;
  if (status === 'active') {
    el.classList.add('active');
    el.classList.remove('done');
    const badge = el.querySelector('.step-status');
    if (badge) { badge.textContent = 'running'; badge.className = 'step-status badge badge-processing'; }
  } else if (status === 'done') {
    el.classList.remove('active');
    el.classList.add('done');
    const badge = el.querySelector('.step-status');
    if (badge) { badge.textContent = 'done'; badge.className = 'step-status badge badge-completed'; }
  }
}

function pulseNetworkNodeByName(agentName) {
  for (const [key, agentId] of Object.entries(AGENT_NAME_MAP)) {
    if (agentName.includes(key.replace(' Agent','')) || key.includes(agentName)) {
      pulseNetworkNode(agentId);
      return;
    }
  }
  // centralized names don't have "Agent" suffix — try direct lookup
  const idMap = { 'Privacy Guardian':'privacy', 'Bias Detector':'bias',
                  'Skill Verifier':'skill', 'Candidate Matcher':'matcher',
                  'Credential Issuer':'credential', 'Orchestrator':'orchestrator' };
  const id = idMap[agentName];
  if (id) pulseNetworkNode(id);
}

function handleAgentEvent(ev) {
  state.events.push(ev);
  if (state.events.length > 500) state.events.shift();

  // Update agent status
  const agentId = AGENT_NAME_MAP[ev.agent_name];
  if (agentId) {
    state.agentStatus[agentId] = ev.status;
    updateAgentCard(agentId, ev.status);
    pulseNetworkNode(agentId);
  }

  // Update pipeline steps
  if (ev.conversation_id && ev.conversation_id === state.activeSession) {
    updatePipelineSteps(ev);
  }

  // Log it
  appendLogEntry(ev);
  updateOnlineCount();
  drawNetwork();
}

function onApplicationReceived(payload) {
  state.activeSession = payload.conversation_id;
  showPipelineProgress();
  switchToTab('live-tab');
  appendLogEntry({
    event_type: 'application_received',
    agent_name: 'API Server',
    step: `📥 Application received: ${payload.candidate_name} → ${payload.job_title}`,
    status: 'info',
    conversation_id: payload.conversation_id,
    timestamp: payload.timestamp,
  });
}

function onPipelineResult(payload) {
  const result = payload.result;
  if (!result) return;

  // Show in results tab
  renderResultCard(payload.conversation_id, result);

  // Update submit button
  const btn = document.getElementById('submit-btn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '🚀 Submit to Fair Hiring Pipeline';
  }

  // Update all steps to done
  ['step-privacy','step-bias','step-skill','step-match','step-cred'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.classList.add('done');
      const badge = el.querySelector('.step-status');
      if (badge) { badge.textContent = 'done'; badge.className = 'step-status badge badge-completed'; }
    }
  });

  // Notify user
  const decision = result?.final_decision?.final_recommendation || '?';
  appendLogEntry({
    event_type: 'pipeline_complete',
    agent_name: 'System',
    step: `✅ Pipeline complete. Decision: ${decision}. See Results tab.`,
    status: 'completed',
    conversation_id: payload.conversation_id,
    timestamp: new Date().toISOString(),
  });
}

// ── Log ───────────────────────────────────────────────────────────────────────

function appendLogEntry(ev) {
  const log = document.getElementById('activity-log');
  if (!log) return;

  const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  const status = ev.status || 'info';

  const entry = document.createElement('div');
  entry.className = `log-entry ${status}`;
  entry.innerHTML = `
    <span class="log-time">${ts}</span>
    <span class="log-agent">${ev.agent_name || 'System'}</span>
    <span class="badge badge-${status}">${status}</span>
    <span class="log-step">${ev.step || ev.event_type || ''}</span>
  `;

  log.appendChild(entry);

  const auto = document.getElementById('auto-scroll');
  if (auto?.checked) log.scrollTop = log.scrollHeight;

  const countEl = document.getElementById('event-count');
  if (countEl) countEl.textContent = `${state.events.length} events`;
}

function clearLog() {
  const log = document.getElementById('activity-log');
  if (log) log.innerHTML = '';
  state.events = [];
}

// ── Pipeline UI ───────────────────────────────────────────────────────────────

function showPipelineProgress() {
  const panel = document.getElementById('pipeline-progress');
  if (panel) panel.classList.remove('hidden');
  // reset steps
  ['step-privacy','step-bias','step-skill','step-match','step-cred'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active','done');
      const badge = el.querySelector('.step-status');
      if (badge) { badge.textContent = 'waiting'; badge.className = 'step-status badge badge-waiting'; }
    }
  });
}

function updatePipelineSteps(ev) {
  const stepId = STEP_MAP[ev.agent_name];
  if (!stepId) return;

  const el = document.getElementById(stepId);
  if (!el) return;

  const badge = el.querySelector('.step-status');
  if (ev.status === 'success' || ev.status === 'completed') {
    el.classList.remove('active');
    el.classList.add('done');
    if (badge) { badge.textContent = 'done'; badge.className = 'step-status badge badge-completed'; }
  } else if (ev.status === 'processing' || ev.status === 'running' || ev.status === 'received') {
    el.classList.add('active');
    if (badge) { badge.textContent = 'running'; badge.className = 'step-status badge badge-running'; }
  } else if (ev.status === 'error') {
    el.classList.remove('active');
    if (badge) { badge.textContent = 'error'; badge.className = 'step-status badge badge-error'; }
  }
}

// ── Agent Network Canvas ──────────────────────────────────────────────────────

let animFrame = null;
const nodePositions = {};  // agentId → {x, y}
const pulsingNodes = {};   // agentId → timestamp

function initNetworkPositions() {
  const W = 900, H = 480;
  const cx = W / 2, cy = H / 2;
  const r = 160;
  // Orchestrator in center, others in circle
  nodePositions['orchestrator'] = { x: cx, y: cy };
  const satellites = ['privacy', 'bias', 'skill', 'matcher', 'credential'];
  satellites.forEach((id, i) => {
    const angle = (2 * Math.PI * i / satellites.length) - Math.PI / 2;
    nodePositions[id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

function pulseNetworkNode(agentId) {
  pulsingNodes[agentId] = Date.now();
  if (!animFrame) drawNetworkAnimated();
}

function drawNetworkAnimated() {
  drawNetwork();
  const now = Date.now();
  const anyActive = Object.values(pulsingNodes).some(t => now - t < 2000);
  if (anyActive) {
    animFrame = requestAnimationFrame(drawNetworkAnimated);
  } else {
    animFrame = null;
  }
}

function drawNetwork() {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const now = Date.now();

  // Draw edges (orchestrator → each satellite)
  AGENTS.slice(1).forEach(ag => {
    const from = nodePositions['orchestrator'];
    const to = nodePositions[ag.id];
    if (!from || !to) return;

    const isPulsing = pulsingNodes[ag.id] && (now - pulsingNodes[ag.id]) < 2000;
    const status = state.agentStatus[ag.id];

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);

    if (isPulsing) {
      ctx.strokeStyle = ag.color + 'cc';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);

      // Animated dash offset
      const offset = ((now % 1000) / 1000) * 20;
      ctx.lineDashOffset = -offset;
    } else {
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = 0;
    }

    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  });

  // Draw nodes
  AGENTS.forEach(ag => {
    const pos = nodePositions[ag.id];
    if (!pos) return;

    const isPulsing = pulsingNodes[ag.id] && (now - pulsingNodes[ag.id]) < 2000;
    const status = state.agentStatus[ag.id];

    // Glow ring
    if (isPulsing) {
      const pulseAge = now - pulsingNodes[ag.id];
      const pulseRadius = 22 + (pulseAge / 2000) * 18;
      const pulseAlpha = 1 - pulseAge / 2000;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = ag.color + Math.round(pulseAlpha * 50).toString(16).padStart(2, '0');
      ctx.fill();
    }

    // Status ring
    const ringColor = status === 'success' ? '#10b981'
                    : status === 'error'   ? '#ef4444'
                    : status === 'processing' || status === 'received' ? '#f59e0b'
                    : ag.color;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#16162a';
    ctx.fill();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = isPulsing ? 3 : 1.5;
    ctx.stroke();

    // Inner filled circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = ag.color + '33';
    ctx.fill();

    // Icon
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ag.icon, pos.x, pos.y);

    // Label
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(ag.name, pos.x, pos.y + 32);

    // Port
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`:${ag.port}`, pos.x, pos.y + 44);
  });
}

function buildAgentLegend() {
  const container = document.getElementById('agent-cards-list');
  if (!container) return;
  container.innerHTML = '';
  AGENTS.forEach(ag => {
    const div = document.createElement('div');
    div.className = 'agent-card';
    div.id = `agent-card-${ag.id}`;
    div.style.borderLeft = `3px solid ${ag.color}`;
    div.innerHTML = `
      <div class="agent-card-header">
        <span class="agent-card-name">${ag.icon} ${ag.name}</span>
        <span class="badge badge-offline" id="agent-badge-${ag.id}">offline</span>
      </div>
      <div class="agent-card-desc">${ag.role}</div>
      <div class="agent-card-port">localhost:${ag.port}</div>
    `;
    container.appendChild(div);
  });
}

function updateAgentCard(agentId, status) {
  const badge = document.getElementById(`agent-badge-${agentId}`);
  if (!badge) return;

  const labels = {
    online:    'online',
    active:    'active',
    thinking:  'thinking…',
    processing:'processing',
    completed: 'done',
    offline:   'offline',
  };
  badge.textContent = labels[status] || status;

  // Map status → CSS modifier
  const cssClass =
    status === 'online'                           ? 'online'      :
    status === 'active' || status === 'thinking'  ? 'processing'  :
    status === 'completed'                        ? 'completed'   :
    status === 'offline'                          ? 'offline'     : status;

  badge.className = `badge badge-${cssClass}`;

  const card = document.getElementById(`agent-card-${agentId}`);
  if (card) {
    card.classList.toggle(
      'active-agent',
      status === 'active' || status === 'thinking' || status === 'processing'
    );
  }
}

function updateOnlineCount() {
  const online = Object.values(state.agentStatus)
    .filter(s => s && s !== 'offline').length;
  const el = document.getElementById('agents-online-count');
  if (el) el.textContent = `${online} agents online`;
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function showTab(tabId) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const section = document.getElementById(tabId);
  if (section) section.classList.add('active');
  const btn = document.querySelector(`[onclick="showTab('${tabId}')"]`);
  if (btn) btn.classList.add('active');

  if (tabId === 'network-tab') {
    initNetworkPositions();
    drawNetwork();
  }
}

function switchToTab(tabId) {
  // Switch to tab without user click (programmatic)
  showTab(tabId);
}

// ── Demo data ──────────────────────────────────────────────────────────────────

function fillDemo() {
  // Candidate
  document.getElementById('c-name').value = 'Arjun Mehta';
  document.getElementById('c-email').value = 'arjun.mehta@example.com';
  document.getElementById('c-exp').value = '4';
  document.getElementById('c-edu').value = 'B.Tech in Computer Science';
  document.getElementById('c-skills').value = 'Python, FastAPI, LangChain, PostgreSQL, Docker, React, REST APIs, Git';
  document.getElementById('c-summary').value = 'Full-stack engineer with 4 years building scalable backend systems. Led migration of monolith to microservices, reducing latency by 40%. Open-source contributor to LangChain.';
  document.getElementById('c-github').value = 'https://github.com/arjunmehta';
  document.getElementById('c-portfolio').value = 'https://arjunmehta.dev';
  document.getElementById('c-certs').value = 'AWS Solutions Architect, Docker Certified Associate';
  document.getElementById('c-cover').value = 'I have been building AI-powered backend systems for 4 years and I am excited about this role because it combines my expertise in distributed systems with my passion for AI agent architectures.';

  // Job
  document.getElementById('j-title').value = 'Senior Backend Engineer — AI Platform';
  document.getElementById('j-desc').value = 'We are looking for a talented backend engineer to join our platform team. You will design and build scalable APIs and AI pipelines that power our product. You will work closely with the AI team on LLM integration and agent frameworks. We value diverse perspectives and welcome candidates from all backgrounds.';
  document.getElementById('j-req').value = 'Python, FastAPI, PostgreSQL, Docker, REST API design';
  document.getElementById('j-nice').value = 'LangChain, Kubernetes, Redis, GraphQL, TypeScript';
  document.getElementById('j-exp').value = '3';
  document.getElementById('j-company').value = 'TechForward Solutions';
  document.getElementById('j-salary').value = '₹20-30 LPA';
}

// ── Submit application ─────────────────────────────────────────────────────────

async function submitApplication() {
  const name    = document.getElementById('c-name').value.trim();
  const skills  = document.getElementById('c-skills').value.trim();
  const jTitle  = document.getElementById('j-title').value.trim();
  const jDesc   = document.getElementById('j-desc').value.trim();

  if (!name || !skills) { alert('Please fill in candidate name and skills.'); return; }
  if (!jTitle || !jDesc) { alert('Please fill in job title and description.'); return; }

  const candidate = {
    name,
    email:              document.getElementById('c-email').value.trim() || null,
    experience_years:   parseInt(document.getElementById('c-exp').value) || 0,
    education:          document.getElementById('c-edu').value.trim() || null,
    skills:             skills.split(',').map(s => s.trim()).filter(Boolean),
    experience_summary: document.getElementById('c-summary').value.trim() || null,
    github_url:         document.getElementById('c-github').value.trim() || null,
    portfolio_url:      document.getElementById('c-portfolio').value.trim() || null,
    certifications:     document.getElementById('c-certs').value.trim().split(',').map(s => s.trim()).filter(Boolean),
    cover_letter:       document.getElementById('c-cover').value.trim() || null,
  };

  const job = {
    title:            jTitle,
    description:      jDesc,
    requirements:     document.getElementById('j-req').value.split(',').map(s => s.trim()).filter(Boolean),
    nice_to_have:     document.getElementById('j-nice').value.split(',').map(s => s.trim()).filter(Boolean),
    experience_years: parseInt(document.getElementById('j-exp').value) || 0,
    company:          document.getElementById('j-company').value.trim() || null,
    salary_range:     document.getElementById('j-salary').value.trim() || null,
  };

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Processing…';

  try {
    const resp = await fetch(`${API}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate, job }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      alert(`API Error: ${err}`);
      btn.disabled = false;
      btn.textContent = '🚀 Submit to Fair Hiring Pipeline';
      return;
    }

    const data = await resp.json();
    state.activeSession = data.conversation_id;
    showPipelineProgress();
    showTab('live-tab');

  } catch (err) {
    alert(`Could not reach API server: ${err.message}\n\nMake sure the API server is running on port 8000.`);
    btn.disabled = false;
    btn.textContent = '🚀 Submit to Fair Hiring Pipeline';
  }
}

// ── Post Job ──────────────────────────────────────────────────────────────────

async function postJob() {
  const title = document.getElementById('pj-title').value.trim();
  const desc  = document.getElementById('pj-desc').value.trim();
  if (!title || !desc) { alert('Please fill in job title and description.'); return; }

  const job = {
    title,
    description:      desc,
    requirements:     document.getElementById('pj-req').value.split(',').map(s => s.trim()).filter(Boolean),
    nice_to_have:     document.getElementById('pj-nice').value.split(',').map(s => s.trim()).filter(Boolean),
    experience_years: parseInt(document.getElementById('pj-exp').value) || 0,
    company:          document.getElementById('pj-company').value.trim() || null,
    salary_range:     document.getElementById('pj-salary').value.trim() || null,
  };

  try {
    const resp = await fetch(`${API}/api/jobs`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(job),
    });
    const data = await resp.json();
    const resultBox = document.getElementById('post-job-result');
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `✅ Job posted! ID: <code>${data.job_id}</code>`;
    loadJobs();
  } catch(err) {
    alert(`Error: ${err.message}`);
  }
}

async function loadJobs() {
  try {
    const resp = await fetch(`${API}/api/jobs`);
    const data = await resp.json();
    state.jobs = data.jobs || [];
    renderJobs();
  } catch(e) { /* api not ready yet */ }
}

function renderJobs() {
  const list = document.getElementById('jobs-list');
  const count = document.getElementById('jobs-count');
  if (!list) return;
  if (count) count.textContent = state.jobs.length;

  if (state.jobs.length === 0) {
    list.innerHTML = '<p class="empty-msg">No jobs posted yet.</p>';
    return;
  }

  list.innerHTML = state.jobs.map(j => `
    <div class="job-item">
      <div class="job-title-group">
        <span class="job-title">${j.title}</span>
        <span class="job-sub">${j.company || 'No company'} · ${j.experience_years || 0}+ yrs · ${j.salary_range || 'Salary not listed'}</span>
      </div>
      <span class="badge badge-info">ID: ${j.id}</span>
    </div>
  `).join('');
}

// ── Results rendering ─────────────────────────────────────────────────────────

function renderResultCard(conversationId, result) {
  const container = document.getElementById('results-container');
  if (!container) return;

  const fd = result?.final_decision || {};
  const bias = result?.bias || {};
  const skill = result?.skill_verification || {};
  const match_ = result?.matching || {};
  const privacy = result?.privacy || {};
  const cred = result?.credential || {};

  const recommendation = fd.final_recommendation || 'UNKNOWN';
  const overallScore   = fd.overall_score || match_.match_score || 0;
  const matchScore     = match_.match_score || 0;
  const skillScore     = skill.overall_skill_score || 0;
  const biasScore      = bias.bias_free_score || 0;
  const privacyScore   = privacy.privacy_score || 0;
  const biasFlags      = bias.bias_flags || [];
  const verifiedSkills = skill.verified_skills || [];
  const keyStrengths   = fd.key_strengths || match_.strengths || [];
  const keyGaps        = fd.key_gaps || match_.skill_gaps || [];
  const nextSteps      = fd.next_steps || [];
  const summary        = fd.executive_summary || match_.match_reasoning || '';
  const fairness       = fd.fairness_guarantee || '';
  const credential     = cred.verifiable_credential;
  const duration       = result.pipeline_duration_seconds;

  const card = document.createElement('div');
  card.className = 'result-card';
  card.id = `result-${conversationId}`;

  card.innerHTML = `
    <div class="result-header">
      <div>
        <h3>📊 ${result?.job_title || 'Assessment'} — ${conversationId?.slice(0,8)}…</h3>
        <small style="color: var(--text-muted);">Duration: ${duration}s · ${new Date().toLocaleString()}</small>
      </div>
      <span class="decision-badge decision-${recommendation}">${rec_emoji(recommendation)} ${recommendation}</span>
    </div>

    <!-- Score cards -->
    <div class="result-body">
      <div class="score-card">
        <div class="score-value">${overallScore}</div>
        <div class="score-label">Overall Score</div>
      </div>
      <div class="score-card">
        <div class="score-value">${matchScore}</div>
        <div class="score-label">Job Match</div>
      </div>
      <div class="score-card">
        <div class="score-value">${skillScore}</div>
        <div class="score-label">Skill Score</div>
      </div>
      <div class="score-card">
        <div class="score-value">${biasScore}</div>
        <div class="score-label">Bias-Free Score</div>
      </div>
      <div class="score-card">
        <div class="score-value">${privacyScore}</div>
        <div class="score-label">Privacy Score</div>
      </div>
    </div>

    <!-- Summary -->
    <div class="result-section">
      <h4>📝 Executive Summary</h4>
      <div class="summary-text">${summary || 'No summary available.'}</div>
      ${fairness ? `<div class="summary-text" style="margin-top:0.5rem;border-color:rgba(16,185,129,0.2);color:#10b981;">🛡️ ${fairness}</div>` : ''}
    </div>

    <!-- Strengths & Gaps -->
    <div class="result-section" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div>
        <h4>💪 Key Strengths</h4>
        <div class="tag-list">${keyStrengths.map(s => `<span class="tag">${s}</span>`).join('') || '<span class="empty-msg">—</span>'}</div>
      </div>
      <div>
        <h4>⚠️ Skill Gaps</h4>
        <div class="tag-list">${keyGaps.map(g => `<span class="tag tag-gap">${g}</span>`).join('') || '<span class="empty-msg">None</span>'}</div>
      </div>
    </div>

    <!-- Verified Skills -->
    ${verifiedSkills.length > 0 ? `
    <div class="result-section">
      <h4>✅ Verified Skills</h4>
      <div class="verified-skills">
        ${verifiedSkills.map(s => `
          <div class="skill-item">
            <div class="skill-name">${s.skill || s}</div>
            ${s.level ? `<div class="skill-meta">${s.level} · Confidence: ${s.confidence || 0}%</div>
            <div class="confidence-bar"><div class="confidence-fill" style="width:${s.confidence || 0}%"></div></div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Bias flags -->
    ${biasFlags.length > 0 ? `
    <div class="result-section">
      <h4>⚖️ Bias Flags (${biasFlags.length})</h4>
      <div class="bias-flags">
        ${biasFlags.map(f => `
          <div class="bias-flag ${f.severity}">
            <strong>${f.type?.replace(/_/g, ' ') || 'Bias'}</strong>
            <span class="badge badge-${f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'info'}">${f.severity}</span>
            <div style="margin-top:0.3rem;font-size:0.76rem;color:var(--text-muted);">${f.explanation || ''}</div>
            ${f.suggested_rewrite ? `<div style="margin-top:0.2rem;color:var(--success);font-size:0.74rem;">✏️ ${f.suggested_rewrite}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : `
    <div class="result-section">
      <h4>⚖️ Bias Check</h4>
      <div style="color:var(--success);font-size:0.85rem;">✅ No bias flags detected. Job description passed bias screening.</div>
    </div>`}

    <!-- Next Steps -->
    ${nextSteps.length > 0 ? `
    <div class="result-section">
      <h4>🚀 Next Steps</h4>
      <ul style="padding-left:1.2rem;color:var(--text-dim);font-size:0.85rem;display:flex;flex-direction:column;gap:0.3rem;">
        ${nextSteps.map(s => `<li>${s}</li>`).join('')}
      </ul>
    </div>` : ''}

    <!-- Verifiable Credential -->
    ${credential ? `
    <div class="result-section">
      <h4>📜 Verifiable Credential</h4>
      <div class="credential-box">${JSON.stringify(credential, null, 2)}</div>
      <div style="margin-top:0.5rem;color:var(--text-muted);font-size:0.75rem;">
        Integrity hash: <code style="color:var(--success)">${cred.claims_hash?.slice(0,32) || ''}…</code>
      </div>
    </div>` : ''}

    <!-- Audit Trail -->
    ${cred.audit_trail ? `
    <div class="result-section">
      <h4>🔍 Process Audit Trail</h4>
      <div style="display:flex;flex-direction:column;gap:0.4rem;">
        ${(cred.audit_trail.steps_completed || []).map(s => `
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:var(--surface2);border-radius:6px;font-size:0.8rem;">
            <span style="color:var(--success)">✓</span>
            <span style="color:var(--text-dim)">${s.step}</span>
            <span style="margin-left:auto;color:var(--text-muted);font-size:0.72rem;">${s.agent}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  // Remove empty msg if present
  const emptyMsg = container.querySelector('.empty-msg');
  if (emptyMsg) emptyMsg.remove();

  // Prepend (newest first)
  container.insertBefore(card, container.firstChild);

  // Switch to results tab
  setTimeout(() => switchToTab('results-tab'), 500);
}

function rec_emoji(r) {
  return r === 'ADVANCE' ? '✅' : r === 'HOLD' ? '⏸️' : r === 'REJECT' ? '❌' : '❓';
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  connectWS();
  buildAgentLegend();
  initNetworkPositions();
  loadJobs();

  // Ping every 20s to keep WS alive
  setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
  }, 20000);

  // Refresh jobs every 30s
  setInterval(loadJobs, 30000);

  // Initial canvas draw
  setTimeout(() => drawNetwork(), 500);
});
