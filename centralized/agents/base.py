"""
Shared base classes and utilities for all TalentInfra agents.
"""

import os
import json
import logging
import threading
from typing import Optional, Dict, Any, List, Callable

from dotenv import load_dotenv
load_dotenv()

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from zyndai_agent import AgentConfig, ZyndAIAgent

# ── Environment ──────────────────────────────────────────────────────────────────
ZYND_REGISTRY_URL = os.environ.get("ZYND_REGISTRY_URL", "https://registry.zynd.ai")
ZYND_API_KEY      = os.environ.get("ZYND_API_KEY", "")
OLLAMA_BASE_URL   = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# LLM provider: "ollama" (default, local), "openai", or "groq"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "ollama").lower()

# Resolved model names per provider (configurable via env)
_PROVIDER_BIG: Dict[str, str] = {
    "ollama":  os.environ.get("BIG_MODEL",          "glm-5:cloud"),
    "openai":  os.environ.get("OPENAI_BIG_MODEL",   "gpt-4o"),
    "groq":    os.environ.get("GROQ_BIG_MODEL",     "llama-3.3-70b-versatile"),
}
_PROVIDER_SMALL: Dict[str, str] = {
    "ollama":  os.environ.get("SMALL_MODEL",         "llama3.2:3b"),
    "openai":  os.environ.get("OPENAI_SMALL_MODEL",  "gpt-4o-mini"),
    "groq":    os.environ.get("GROQ_SMALL_MODEL",    "llama-3.1-8b-instant"),
}
BIG_MODEL   = _PROVIDER_BIG.get(LLM_PROVIDER,   _PROVIDER_BIG["ollama"])
SMALL_MODEL = _PROVIDER_SMALL.get(LLM_PROVIDER, _PROVIDER_SMALL["ollama"])


def get_llm(model_name: str, temperature: float = 0.1):
    """
    Factory that returns the appropriate LangChain chat model based on LLM_PROVIDER.
    • ollama  → ChatOllama (local, dev default)
    • openai  → ChatOpenAI (requires OPENAI_API_KEY)
    • groq    → ChatGroq   (requires GROQ_API_KEY)
    """
    if LLM_PROVIDER == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            api_key=os.environ.get("OPENAI_API_KEY"),
        )
    elif LLM_PROVIDER == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(
            model=model_name,
            temperature=temperature,
            api_key=os.environ.get("GROQ_API_KEY"),
        )
    else:  # ollama (default)
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=model_name,
            base_url=OLLAMA_BASE_URL,
            temperature=temperature,
        )

# Zynd webhook ports — used only for DID registration, NOT for inter-agent comms
AGENT_PORTS: Dict[str, int] = {
    "orchestrator": 6001,
    "skill":        6002,
    "bias":         6003,
    "matcher":      6004,
    "privacy":      6005,
    "credential":   6006,
}

# Stream callback type
# stream_fn(token, event_type, agent_name, meta_dict)
# event_type: "token" | "step" | "thinking_start" | "thinking_end" | "result" | "error"
StreamFn = Callable[[str, str, str, dict], None]


# ─────────────────────────────────────────────────────────────────────────────
# Per-agent conversation memory
# ─────────────────────────────────────────────────────────────────────────────
class AgentMemory:
    """Thread-safe per-conversation chat history."""

    def __init__(self, system_prompt: str, max_history: int = 10):
        self.system_prompt = system_prompt
        self.max_history   = max_history
        self._store: Dict[str, list] = {}
        self._lock = threading.Lock()

    def get_messages(self, cid: str) -> list:
        with self._lock:
            if cid not in self._store:
                self._store[cid] = [SystemMessage(content=self.system_prompt)]
            return list(self._store[cid])

    def add_turn(self, cid: str, human: str, ai: str):
        with self._lock:
            if cid not in self._store:
                self._store[cid] = [SystemMessage(content=self.system_prompt)]
            h = self._store[cid]
            h.append(HumanMessage(content=human))
            h.append(AIMessage(content=ai))
            max_msgs = 1 + self.max_history * 2
            if len(h) > max_msgs:
                self._store[cid] = [h[0]] + h[-(self.max_history * 2):]


# ─────────────────────────────────────────────────────────────────────────────
# Base Agent
# ─────────────────────────────────────────────────────────────────────────────
class BaseAgent:
    """
    Common base for all TalentInfra agents.

    Subclasses must define:
        name, role, port_key, description, capabilities, system_prompt
    """

    name: str       = "Base Agent"
    role: str       = "base"
    model: str      = SMALL_MODEL
    port_key: str   = "skill"
    system_prompt: str = "You are a helpful assistant."
    description: str   = ""
    capabilities: dict = {}

    def __init__(self):
        self.logger = logging.getLogger(f"TalentInfra.{self.name}")
        self.memory = AgentMemory(self.system_prompt)
        self.llm    = get_llm(self.model, temperature=0.1)
        self.zynd_agent: Optional[ZyndAIAgent] = None
        self._registered = False

    # ── Zynd registration ──────────────────────────────────────────────────
    def register(self):
        """Register this agent on the Zynd Protocol (called once at startup)."""
        if self._registered:
            return
        try:
            cfg = AgentConfig(
                name=self.name,
                description=self.description,
                capabilities=self.capabilities,
                webhook_host="0.0.0.0",
                webhook_port=AGENT_PORTS[self.port_key],
                auto_reconnect=True,
                message_history_limit=50,
                registry_url=ZYND_REGISTRY_URL,
                api_key=ZYND_API_KEY,
                config_dir=f".agent-c-{self.port_key}",
            )
            self.zynd_agent  = ZyndAIAgent(agent_config=cfg)
            self._registered = True
            self.logger.info(
                f"✓ Registered on Zynd | port {AGENT_PORTS[self.port_key]}"
            )
        except Exception as exc:
            self.logger.warning(f"Zynd registration failed (standalone mode): {exc}")

    @property
    def did(self) -> str:
        if self.zynd_agent:
            return self.zynd_agent.identity_credential.get("issuer", "local")
        return "local"

    @property
    def agent_id(self) -> str:
        if self.zynd_agent:
            return self.zynd_agent.agent_id
        return self.port_key

    # ── LLM call with token streaming ─────────────────────────────────────
    def _llm_stream(
        self,
        prompt: str,
        cid: str,
        stream_fn: StreamFn,
        extra_system: Optional[str] = None,
    ) -> str:
        """
        Stream LLM tokens one-by-one via stream_fn.
        Returns the full response text.
        """
        sys_msg   = SystemMessage(content=extra_system or self.system_prompt)
        msgs      = [sys_msg, HumanMessage(content=prompt)]
        full_text = ""
        try:
            for chunk in self.llm.stream(msgs):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    full_text += token
                    stream_fn(token, "token", self.name, {"conversation_id": cid})
        except Exception as exc:
            err_msg = f"\n[LLM ERROR: {exc}]"
            full_text += err_msg
            stream_fn(err_msg, "error", self.name, {"conversation_id": cid})

        self.memory.add_turn(cid, prompt, full_text)
        return full_text

    # ── JSON extractor ─────────────────────────────────────────────────────
    @staticmethod
    def _extract_json(text: str) -> Optional[dict]:
        """Extract a JSON object from a potentially markdown-wrapped response."""
        for marker in ("```json", "```"):
            if marker in text:
                try:
                    inner = text.split(marker)[1].split("```")[0].strip()
                    return json.loads(inner)
                except Exception:
                    pass
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                pass
        return None
