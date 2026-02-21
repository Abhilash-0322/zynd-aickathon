"""
Orchestrator Agent
==================
Central coordinator for the Fair Hiring Network.
Receives aggregated results from all 5 specialist agents and synthesizes
a final, transparent, data-driven hiring recommendation using the large model.
"""

import json
from centralized.agents.base import BaseAgent, BIG_MODEL, StreamFn


class OrchestratorAgent(BaseAgent):
    name     = "Orchestrator"
    role     = "orchestrator"
    port_key = "orchestrator"
    model    = BIG_MODEL          # uses the larger model
    description = (
        "Central orchestrator for the Fair Hiring Network. Coordinates the full "
        "multi-agent, bias-free candidate evaluation pipeline using Zynd Protocol."
    )
    capabilities = {
        "ai":       ["nlp", "agent_orchestration", "decision_making", "pipeline_coordination"],
        "protocols": ["http"],
        "services": ["hiring_orchestration", "agent_discovery", "fair_hiring_decision"],
        "domains":  ["hiring", "orchestration", "fair_hiring", "multi_domain"],
    }
    system_prompt = (
        "You are the Orchestrator Agent for the Fair Hiring Network — a decentralized, "
        "bias-free hiring platform powered by the Zynd Protocol.\n\n"
        "You receive multi-agent assessment results and synthesize a final, "
        "transparent, data-driven hiring decision.\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "final_recommendation": "ADVANCE|HOLD|REJECT",\n'
        '  "confidence": 85,\n'
        '  "overall_score": 78,\n'
        '  "key_strengths": ["..."],\n'
        '  "key_gaps": ["..."],\n'
        '  "executive_summary": "3-4 sentence summary",\n'
        '  "next_steps": ["..."],\n'
        '  "fairness_guarantee": "statement"\n'
        "}"
    )

    def synthesize(self, pipeline_results: dict, cid: str, stream_fn: StreamFn) -> dict:
        stream_fn("", "step", self.name, {
            "conversation_id": cid,
            "step": "🧠 Synthesizing all agent findings into final decision…",
        })

        bias      = pipeline_results.get("bias", {})
        skill     = pipeline_results.get("skill_verification", {})
        match_res = pipeline_results.get("matching", {})
        privacy   = pipeline_results.get("privacy", {})

        prompt = (
            f'Synthesize a final hiring decision for "{pipeline_results.get("job_title", "?")}"\n\n'
            f"PRIVACY ANALYSIS:\n  Privacy Score: {privacy.get('privacy_score', 'N/A')}\n\n"
            f"BIAS DETECTION:\n"
            f"  Bias-Free Score: {bias.get('bias_free_score', 'N/A')}\n"
            f"  Flags: {len(bias.get('bias_flags', []))} "
            f"({sum(1 for f in bias.get('bias_flags', []) if f.get('severity') == 'high')} high)\n\n"
            f"SKILL VERIFICATION:\n"
            f"  Overall Skill Score: {skill.get('overall_skill_score', 'N/A')}/100\n"
            f"  Verified Skills: {len(skill.get('verified_skills', []))}\n\n"
            f"CANDIDATE MATCHING:\n"
            f"  Match Score: {match_res.get('match_score', 'N/A')}/100\n"
            f"  Recommendation: {match_res.get('recommendation', 'N/A')}\n"
            f"  Skill Gaps: {match_res.get('skill_gaps', [])}\n\n"
            "Return ONLY valid JSON with the final decision."
        )

        stream_fn("", "thinking_start", self.name, {"conversation_id": cid})
        raw = self._llm_stream(prompt, cid, stream_fn)
        stream_fn("", "thinking_end",   self.name, {"conversation_id": cid})

        result = self._extract_json(raw)
        if not result:
            ms = match_res.get("match_score", 0)
            result = {
                "final_recommendation": (
                    "ADVANCE" if ms >= 65 else ("HOLD" if ms >= 40 else "REJECT")
                ),
                "confidence": 70,
                "overall_score": ms,
                "key_strengths": match_res.get("strengths", []),
                "key_gaps": match_res.get("skill_gaps", []),
                "executive_summary": match_res.get("match_reasoning", "Assessment completed."),
                "next_steps": match_res.get("next_steps", []),
                "fairness_guarantee": (
                    "This assessment was conducted using anonymized profiles "
                    "with bias detection and privacy preservation."
                ),
            }

        stream_fn("", "result", self.name, {
            "conversation_id": cid,
            "step": (
                f"🏁 Final decision: {result.get('final_recommendation', '?')} "
                f"(score: {result.get('overall_score', 0)}/100)"
            ),
            "data": {
                "final_recommendation": result.get("final_recommendation", "?"),
                "confidence":           result.get("confidence", 0),
                "overall_score":        result.get("overall_score", 0),
            },
        })
        return result
