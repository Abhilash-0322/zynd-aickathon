"""
Privacy Guardian Agent
======================
Anonymizes candidate profiles for completely blind, fair screening.
Removes name, gender, age, email, photo and other PII while preserving
skills and quantified achievements.
"""

import json
import hashlib
from centralized.agents.base import BaseAgent, StreamFn


class PrivacyGuardianAgent(BaseAgent):
    name     = "Privacy Guardian"
    role     = "privacy"
    port_key = "privacy"
    description = (
        "Anonymizes candidate profiles for blind screening by removing PII — "
        "name, gender, age, photo, email — while preserving skills and achievements."
    )
    capabilities = {
        "ai":       ["nlp", "data_anonymization", "privacy_preservation"],
        "protocols": ["http"],
        "services": ["profile_anonymization", "pii_removal", "blind_screening_prep"],
        "domains":  ["hiring", "privacy", "fair_hiring"],
    }
    system_prompt = (
        "You are a Privacy Guardian Agent for TalentInfra — a fair hiring network powered by Zynd Protocol.\n"
        "Your job: anonymize candidate profiles for completely blind, fair screening.\n\n"
        "REMOVE / MASK:\n"
        "- Full name → 'Candidate-[HASH]'\n"
        "- Gender pronouns / indicators\n"
        "- Age and date of birth\n"
        "- Photos / avatar URLs\n"
        "- Personal social media (keep GitHub as 'portfolio_1')\n"
        "- Home address (keep region/country only if relevant)\n"
        "- University name (keep degree type + field only)\n"
        "- Religious / political affiliations\n\n"
        "KEEP: skills, years of experience, project descriptions (anonymized), "
        "quantified achievements, certifications (type only).\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "anonymized_profile": { ... },\n'
        '  "fields_removed": ["field1"],\n'
        '  "privacy_score": 92,\n'
        '  "notes": "..."\n'
        "}"
    )

    def process(self, candidate: dict, cid: str, stream_fn: StreamFn) -> dict:
        stream_fn("", "step", self.name, {
            "conversation_id": cid,
            "step": "🔒 Anonymizing candidate profile for blind screening…",
        })

        # Fast rule-based pre-pass
        pre = dict(candidate)
        if "name" in pre:
            h = hashlib.sha256(str(pre["name"]).encode()).hexdigest()[:8].upper()
            pre["name"] = f"Candidate-{h}"
        for field in [
            "email", "phone", "address", "photo", "avatar", "picture",
            "gender", "age", "dob", "date_of_birth", "nationality",
            "religion", "marital_status", "linkedin", "twitter",
        ]:
            pre.pop(field, None)

        prompt = (
            "Further anonymize this pre-processed candidate profile. "
            "Remove ALL remaining identifying information while preserving "
            "job-relevant skills and achievements.\n\n"
            f"PRE-PROCESSED PROFILE:\n{json.dumps(pre, indent=2)}\n\n"
            "Return ONLY valid JSON with anonymized_profile, fields_removed, "
            "privacy_score (0-100), and notes."
        )

        stream_fn("", "thinking_start", self.name, {"conversation_id": cid})
        raw = self._llm_stream(prompt, cid, stream_fn)
        stream_fn("", "thinking_end",   self.name, {"conversation_id": cid})

        result = self._extract_json(raw)
        if not result:
            result = {
                "anonymized_profile": pre,
                "fields_removed": list(set(candidate.keys()) - set(pre.keys())),
                "privacy_score": 75,
                "notes": "Rule-based anonymization applied (LLM parse failed)",
            }

        stream_fn("", "result", self.name, {
            "conversation_id": cid,
            "step": f"✅ Profile anonymized — privacy score: {result.get('privacy_score', 0)}/100",
            "data": {
                "privacy_score": result.get("privacy_score", 0),
                "fields_removed": len(result.get("fields_removed", [])),
            },
        })
        return result
