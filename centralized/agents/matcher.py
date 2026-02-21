"""
Candidate Matcher Agent
=======================
Objectively matches anonymized candidate skill profiles to job
requirements using transparent, bias-free scoring.
Match thresholds: STRONG_MATCH ≥80 | GOOD_MATCH 65-79 |
MODERATE_MATCH 50-64 | WEAK_MATCH 30-49 | NO_MATCH <30
"""

import json
from typing import List
from centralized.agents.base import BaseAgent, StreamFn


class CandidateMatcherAgent(BaseAgent):
    name     = "Candidate Matcher"
    role     = "matcher"
    port_key = "matcher"
    description = (
        "Objectively matches anonymized candidate skill profiles to job "
        "requirements using transparent scoring."
    )
    capabilities = {
        "ai":       ["nlp", "skill_matching", "recommendation"],
        "protocols": ["http"],
        "services": ["candidate_matching", "skill_gap_analysis", "job_fit_scoring"],
        "domains":  ["hiring", "talent_matching", "fair_hiring"],
    }
    system_prompt = (
        "You are a Candidate Matching Agent for a Fair Hiring Network.\n"
        "Match purely on: skills, experience, demonstrated competencies.\n"
        "Ignore: name, gender, age, school prestige, location (unless required).\n\n"
        "Match thresholds: STRONG_MATCH≥80 GOOD_MATCH 65-79 "
        "MODERATE_MATCH 50-64 WEAK_MATCH 30-49 NO_MATCH<30\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "match_score": 82,\n'
        '  "required_skills_match": 88,\n'
        '  "nice_to_have_match": 65,\n'
        '  "experience_match": 80,\n'
        '  "skill_gaps": ["skill1"],\n'
        '  "strengths": ["strength1"],\n'
        '  "match_reasoning": "...",\n'
        '  "recommendation": "STRONG_MATCH|GOOD_MATCH|MODERATE_MATCH|WEAK_MATCH|NO_MATCH",\n'
        '  "next_steps": ["..."]\n'
        "}"
    )

    def process(
        self,
        candidate: dict,
        verified_skills: List,
        skill_score: int,
        job: dict,
        cid: str,
        stream_fn: StreamFn,
    ) -> dict:
        stream_fn("", "step", self.name, {
            "conversation_id": cid,
            "step": "🔗 Calculating objective, bias-free match score…",
        })

        payload = {
            "candidate_profile":   candidate,
            "verified_skills":     verified_skills,
            "overall_skill_score": skill_score,
            "job_title":           job.get("title", ""),
            "job_description":     job.get("description", ""),
            "required_skills":     job.get("requirements", []),
            "nice_to_have":        job.get("nice_to_have", []),
            "experience_required": job.get("experience_years", 0),
        }

        prompt = (
            "Match the candidate to the job. Use ONLY skills and experience — "
            "no demographic information.\n\n"
            f"MATCHING DATA:\n{json.dumps(payload, indent=2)}\n\n"
            "Return ONLY valid JSON."
        )

        stream_fn("", "thinking_start", self.name, {"conversation_id": cid})
        raw = self._llm_stream(prompt, cid, stream_fn)
        stream_fn("", "thinking_end",   self.name, {"conversation_id": cid})

        result = self._extract_json(raw)
        if not result:
            result = {
                "match_score": 0,
                "skill_gaps": [],
                "strengths": [],
                "match_reasoning": raw[:300],
                "recommendation": "UNKNOWN",
                "next_steps": [],
            }

        stream_fn("", "result", self.name, {
            "conversation_id": cid,
            "step": (
                f"✅ Match score: {result.get('match_score', 0)}/100 — "
                f"{result.get('recommendation', '?')}"
            ),
            "data": {
                "match_score":    result.get("match_score", 0),
                "recommendation": result.get("recommendation", "?"),
                "skill_gaps":     result.get("skill_gaps", []),
            },
        })
        return result
