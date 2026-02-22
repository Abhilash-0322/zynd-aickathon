"""
Sequential Pipeline Runner
==========================
Calls each agent in order:
  Privacy → Bias → Skill Verifier → Candidate Matcher → Credential Issuer → Orchestrator

All steps are purely sequential (one LLM at a time) to avoid hammering Ollama.
Every LLM token is forwarded to the caller via the stream_fn callback.
"""

import uuid
import logging
from typing import Dict, Any, Callable

from centralized.agents import (
    PrivacyGuardianAgent,
    BiasDetectorAgent,
    SkillVerifierAgent,
    CandidateMatcherAgent,
    CredentialIssuerAgent,
    OrchestratorAgent,
    StreamFn,
)
# Individual modules for reference:
#   centralized/agents/privacy.py      — PrivacyGuardianAgent
#   centralized/agents/bias.py         — BiasDetectorAgent
#   centralized/agents/skill.py        — SkillVerifierAgent
#   centralized/agents/matcher.py      — CandidateMatcherAgent
#   centralized/agents/credential.py   — CredentialIssuerAgent
#   centralized/agents/orchestrator.py — OrchestratorAgent

log = logging.getLogger("TalentInfra.Pipeline")


class PipelineRunner:
    """
    Holds one instance of each agent and runs the hiring evaluation pipeline.
    Instantiate once at process startup (agents register on Zynd in __init__).
    Call .run(application, stream_fn) for each incoming application.
    """

    def __init__(self):
        log.info("Instantiating centralized pipeline agents…")
        self.privacy    = PrivacyGuardianAgent()
        self.bias       = BiasDetectorAgent()
        self.skill      = SkillVerifierAgent()
        self.matcher    = CandidateMatcherAgent()
        self.credential = CredentialIssuerAgent()
        self.orchestrator = OrchestratorAgent()
        log.info("All 6 agents instantiated.")

    def register_all(self):
        """Register all agents on Zynd Protocol (call once at startup)."""
        for agent in [
            self.privacy, self.bias, self.skill,
            self.matcher, self.credential, self.orchestrator,
        ]:
            try:
                agent.register()
            except Exception as exc:
                log.warning(f"[{agent.name}] Zynd registration skipped: {exc}")

    # ─────────────────────────────────────────────────────────────────────────
    def run(self, application: Dict[str, Any], stream_fn: StreamFn) -> Dict[str, Any]:
        """
        Execute the full pipeline synchronously and return the aggregated results.

        Parameters
        ----------
        application : dict
            Keys: candidate (dict), job (dict)
        stream_fn : callable
            stream_fn(token, event_type, agent_name, meta_dict)
            event_type:   "token" | "step" | "thinking_start" |
                          "thinking_end" | "result" | "error" | "pipeline_event"
        """
        cid = str(uuid.uuid4())[:8]

        stream_fn("", "pipeline_event", "Pipeline", {
            "conversation_id": cid,
            "status": "started",
            "message": "🚀 Fair Hiring Pipeline started",
        })

        candidate = application.get("candidate", {})
        job       = application.get("job", {})

        # ── Stage 1: Privacy Guardian ─────────────────────────────────────
        log.info(f"[{cid}] Stage 1: Privacy Guardian")
        privacy_result = self.privacy.process(candidate, cid, stream_fn)
        anon_profile   = privacy_result.get("anonymized_profile", candidate)

        # ── Stage 2: Bias Detector ────────────────────────────────────────
        log.info(f"[{cid}] Stage 2: Bias Detector")
        bias_result = self.bias.process(job, cid, stream_fn)

        # ── Stage 3: Skill Verifier ───────────────────────────────────────
        log.info(f"[{cid}] Stage 3: Skill Verifier")
        requirements       = job.get("requirements", [])
        skill_result       = self.skill.process(anon_profile, requirements, cid, stream_fn)
        verified_skills    = skill_result.get("verified_skills", [])
        overall_skill_score = skill_result.get("overall_skill_score", 0)

        # ── Stage 4: Candidate Matcher ────────────────────────────────────
        log.info(f"[{cid}] Stage 4: Candidate Matcher")
        match_result = self.matcher.process(
            anon_profile, verified_skills, overall_skill_score, job, cid, stream_fn
        )
        match_score      = match_result.get("match_score", 0)
        recommendation   = match_result.get("recommendation", "")
        bias_flags       = bias_result.get("bias_flags", [])
        bias_free        = len([f for f in bias_flags if f.get("severity") == "high"]) == 0

        # ── Stage 5: Credential Issuer ────────────────────────────────────
        log.info(f"[{cid}] Stage 5: Credential Issuer")
        assessment = {
            "candidate_id":  candidate.get("id", cid),
            "job_title":     job.get("title", "Unknown Position"),
            "skill_score":   overall_skill_score,
            "match_score":   match_score,
            "recommendation": recommendation,
            "bias_free":     bias_free,
            "verified_skills": [s.get("skill") for s in verified_skills if isinstance(s, dict)],
        }
        credential_result = self.credential.process(assessment, cid, stream_fn)

        # ── Stage 6: Orchestrator — Final synthesis ───────────────────────
        log.info(f"[{cid}] Stage 6: Orchestrator")
        pipeline_context = {
            "job_title":         job.get("title", ""),
            "privacy":           privacy_result,
            "bias":              bias_result,
            "skill_verification": skill_result,
            "matching":          match_result,
            "credential":        credential_result,
        }
        orchestrator_result = self.orchestrator.synthesize(pipeline_context, cid, stream_fn)

        # ── Assemble final output ─────────────────────────────────────────
        final = {
            "conversation_id":  cid,
            "job_title":        job.get("title", ""),
            "timestamp":        __import__("datetime").datetime.utcnow().isoformat(),
            "pipeline_results": {
                "privacy":           privacy_result,
                "bias_detection":    bias_result,
                "skill_verification": skill_result,
                "matching":          match_result,
                "credential":        credential_result,
                "final_decision":    orchestrator_result,
            },
            "summary": {
                "privacy_score":      privacy_result.get("privacy_score", 0),
                "bias_free_score":    bias_result.get("bias_free_score", 0),
                "skill_score":        overall_skill_score,
                "match_score":        match_score,
                "recommendation":     recommendation,
                "final_decision":     orchestrator_result.get("final_recommendation", "?"),
                "overall_score":      orchestrator_result.get("overall_score", 0),
                "confidence":         orchestrator_result.get("confidence", 0),
                "executive_summary":  orchestrator_result.get("executive_summary", ""),
                "key_strengths":      orchestrator_result.get("key_strengths", []),
                "skill_gaps":         match_result.get("skill_gaps", []),
                "next_steps":         orchestrator_result.get("next_steps", []),
                "fairness_guarantee": orchestrator_result.get("fairness_guarantee", ""),
                "credential_id":      credential_result.get("credential_id", ""),
                "claims_hash":        credential_result.get("claims_hash", ""),
            },
        }

        stream_fn("", "pipeline_event", "Pipeline", {
            "conversation_id": cid,
            "status": "completed",
            "message": (
                f"🎉 Pipeline completed — "
                f"{orchestrator_result.get('final_recommendation','?')} "
                f"(score {orchestrator_result.get('overall_score',0)}/100)"
            ),
            "results": final["summary"],
        })

        log.info(f"[{cid}] Pipeline completed: {orchestrator_result.get('final_recommendation','?')}")
        return final
