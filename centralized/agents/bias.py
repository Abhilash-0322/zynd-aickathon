"""
Bias Detector Agent
===================
Detects and flags algorithmic, linguistic and structural biases
in job descriptions and hiring criteria — gender, age, cultural,
educational elitism, socioeconomic, ableism.
"""

import json
from centralized.agents.base import BaseAgent, StreamFn


class BiasDetectorAgent(BaseAgent):
    name     = "Bias Detector"
    role     = "bias"
    port_key = "bias"
    description = (
        "Detects and flags algorithmic, linguistic and structural biases "
        "in job descriptions and hiring criteria."
    )
    capabilities = {
        "ai":       ["nlp", "bias_detection", "fairness_analysis"],
        "protocols": ["http"],
        "services": ["bias_detection", "fairness_scoring", "inclusive_language"],
        "domains":  ["hiring", "diversity_equity_inclusion", "fair_hiring"],
    }
    system_prompt = (
        "You are a Bias Detection Agent for TalentInfra — a fair hiring network powered by Zynd Protocol.\n"
        "Detect bias types:\n"
        "  gender_bias, age_bias, cultural_bias, educational_elitism, "
        "socioeconomic_bias, ableism, nepotism\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "bias_flags": [\n'
        '    {"type":"...","text_excerpt":"...","severity":"high|medium|low",'
        '"explanation":"...","suggested_rewrite":"..."}\n'
        '  ],\n'
        '  "diversity_score": 75,\n'
        '  "bias_free_score": 68,\n'
        '  "overall_assessment": "...",\n'
        '  "recommended_changes": ["..."]\n'
        "}"
    )

    def process(self, job: dict, cid: str, stream_fn: StreamFn) -> dict:
        stream_fn("", "step", self.name, {
            "conversation_id": cid,
            "step": "⚖️ Scanning job description for bias patterns…",
        })

        prompt = (
            "Analyze the following job posting for bias. "
            "Be thorough — find ALL bias flags with severity ratings.\n\n"
            f"JOB DATA:\n{json.dumps(job, indent=2)}\n\n"
            "Return ONLY valid JSON."
        )

        stream_fn("", "thinking_start", self.name, {"conversation_id": cid})
        raw = self._llm_stream(prompt, cid, stream_fn)
        stream_fn("", "thinking_end",   self.name, {"conversation_id": cid})

        result = self._extract_json(raw)
        if not result:
            result = {
                "bias_flags": [],
                "diversity_score": 50,
                "bias_free_score": 50,
                "overall_assessment": raw[:300],
                "recommended_changes": [],
            }

        n_flags = len(result.get("bias_flags", []))
        high    = sum(1 for f in result.get("bias_flags", []) if f.get("severity") == "high")
        stream_fn("", "result", self.name, {
            "conversation_id": cid,
            "step": (
                f"✅ Bias scan done — {n_flags} flag(s) found"
                + (f" ({high} high severity)" if high else "")
            ),
            "data": {
                "bias_flags": n_flags,
                "high_severity": high,
                "bias_free_score": result.get("bias_free_score", 0),
                "diversity_score": result.get("diversity_score", 0),
            },
        })
        return result
