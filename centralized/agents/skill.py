"""
Skill Verifier Agent
====================
Verifies candidate technical skills using portfolio analysis and
evidence-based scoring with a completely bias-free assessment.
Assigns Beginner / Intermediate / Advanced / Expert proficiency levels
and VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED status to each skill.
"""

import json
from typing import List
from centralized.agents.base import BaseAgent, StreamFn


class SkillVerifierAgent(BaseAgent):
    name     = "Skill Verifier"
    role     = "skill"
    port_key = "skill"
    description = (
        "Verifies candidate technical skills using portfolio analysis and "
        "evidence-based scoring with bias-free assessment."
    )
    capabilities = {
        "ai":       ["nlp", "skill_analysis", "evidence_evaluation"],
        "protocols": ["http"],
        "services": ["skill_verification", "portfolio_analysis", "proficiency_scoring"],
        "domains":  ["hiring", "talent_assessment", "fair_hiring"],
    }
    system_prompt = (
        "You are a Skill Verification Agent for TalentInfra — a fair hiring network powered by Zynd Protocol.\n"
        "For each claimed skill assess:\n"
        "  1. Evidence quality (portfolio, GitHub, projects, certs)\n"
        "  2. Proficiency: Beginner / Intermediate / Advanced / Expert\n"
        "  3. Confidence score 0-100\n"
        "  4. Status: VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "verified_skills": [\n'
        '    {"skill":"Python","level":"Advanced","confidence":85,'
        '"status":"VERIFIED","evidence":"..."}\n'
        '  ],\n'
        '  "overall_skill_score": 78,\n'
        '  "summary": "...",\n'
        '  "recommendations": ["..."]\n'
        "}"
    )

    def process(
        self,
        candidate: dict,
        job_requirements: List,
        cid: str,
        stream_fn: StreamFn,
    ) -> dict:
        stream_fn("", "step", self.name, {
            "conversation_id": cid,
            "step": "🎯 Verifying candidate skills against evidence…",
        })

        payload = dict(candidate)
        payload["job_requirements"] = job_requirements

        prompt = (
            "Analyze and verify all claimed skills for this candidate profile. "
            "Use the job requirements for context.\n\n"
            f"CANDIDATE PROFILE:\n{json.dumps(payload, indent=2)}\n\n"
            "Return ONLY valid JSON."
        )

        stream_fn("", "thinking_start", self.name, {"conversation_id": cid})
        raw = self._llm_stream(prompt, cid, stream_fn)
        stream_fn("", "thinking_end",   self.name, {"conversation_id": cid})

        result = self._extract_json(raw)
        if not result:
            result = {
                "verified_skills": [],
                "overall_skill_score": 0,
                "summary": raw[:300],
                "recommendations": [],
            }

        stream_fn("", "result", self.name, {
            "conversation_id": cid,
            "step": (
                f"✅ Skills verified — score: {result.get('overall_skill_score', 0)}/100 "
                f"({len(result.get('verified_skills', []))} skills)"
            ),
            "data": {
                "overall_skill_score": result.get("overall_skill_score", 0),
                "skills_verified":     len(result.get("verified_skills", [])),
            },
        })
        return result
