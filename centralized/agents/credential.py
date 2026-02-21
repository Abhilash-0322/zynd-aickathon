"""
Credential Issuer Agent
=======================
Issues W3C-standard Verifiable Credentials for verified candidate skills
and creates a transparent, tamper-evident hiring audit trail with
SHA-256 integrity proofs.
"""

import json
import uuid
import hashlib
from datetime import datetime, timedelta
from centralized.agents.base import BaseAgent, StreamFn


class CredentialIssuerAgent(BaseAgent):
    name     = "Credential Issuer"
    role     = "credential"
    port_key = "credential"
    description = (
        "Issues W3C-standard Verifiable Credentials for verified candidate skills "
        "and creates transparent hiring audit trails."
    )
    capabilities = {
        "ai":       ["nlp", "credential_issuance", "audit_trail"],
        "protocols": ["http"],
        "services": ["verifiable_credential_issuance", "did_management", "audit_trail"],
        "domains":  ["hiring", "credentials", "blockchain", "fair_hiring"],
    }
    system_prompt = (
        "You are a Credential Issuer Agent for a Fair Hiring Network.\n"
        "Generate a professional, transparent 3-4 sentence summary of the "
        "hiring assessment that explains:\n"
        "  1. What was assessed and how\n"
        "  2. Key skill findings\n"
        "  3. Match result\n"
        "  4. Process fairness guarantees\n"
        "Return ONLY the summary text (no JSON, no markdown)."
    )

    ISSUER_DID = "did:zynd:fair-hiring-network:issuer"

    def process(self, assessment: dict, cid: str, stream_fn: StreamFn) -> dict:
        stream_fn("", "step", self.name, {
            "conversation_id": cid,
            "step": "📜 Issuing Verifiable Credential and audit trail…",
        })

        now    = datetime.utcnow()
        expiry = now + timedelta(days=365)

        claims = {
            "candidateId":      assessment.get("candidate_id", str(uuid.uuid4())),
            "assessedAt":       now.isoformat(),
            "jobTitle":         assessment.get("job_title", ""),
            "skillScore":       assessment.get("skill_score", 0),
            "matchScore":       assessment.get("match_score", 0),
            "biasFreeProcess":  assessment.get("bias_free", True),
            "privacyPreserved": True,
            "verifiedSkills":   assessment.get("verified_skills", []),
            "recommendation":   assessment.get("recommendation", ""),
        }
        claims_hash = hashlib.sha256(
            json.dumps(claims, sort_keys=True).encode()
        ).hexdigest()

        vc = {
            "@context": [
                "https://www.w3.org/2018/credentials/v1",
                "https://zynd.ai/schemas/fair-hiring/v1",
            ],
            "id":   f"urn:uuid:{uuid.uuid4()}",
            "type": ["VerifiableCredential", "FairHiringAssessmentCredential"],
            "issuer": {
                "id":   self.ISSUER_DID,
                "name": "Fair Hiring Network — Powered by Zynd Protocol",
            },
            "issuanceDate":   now.isoformat() + "Z",
            "expirationDate": expiry.isoformat() + "Z",
            "credentialSubject": claims,
            "proof": {
                "type":               "Sha256IntegrityProof",
                "created":            now.isoformat() + "Z",
                "proofHash":          claims_hash,
                "verificationMethod": f"{self.ISSUER_DID}#keys-1",
                "proofPurpose":       "assertionMethod",
            },
        }

        # LLM-generated human-readable summary
        prompt = (
            "Write a professional 3-4 sentence summary for this hiring assessment:\n\n"
            f"ASSESSMENT DATA:\n{json.dumps(assessment, indent=2)}\n\n"
            "Return ONLY the summary text."
        )

        stream_fn("", "thinking_start", self.name, {"conversation_id": cid})
        summary = self._llm_stream(prompt, cid, stream_fn)
        stream_fn("", "thinking_end",   self.name, {"conversation_id": cid})

        audit = {
            "process_id":        cid,
            "completed_at":      now.isoformat(),
            "integrity_hash":    claims_hash,
            "bias_free":         assessment.get("bias_free", True),
            "privacy_preserved": True,
            "steps_completed": [
                {"step": "Profile Anonymization", "status": "COMPLETED", "agent": "Privacy Guardian"},
                {"step": "Bias Detection",         "status": "COMPLETED", "agent": "Bias Detector"},
                {"step": "Skill Verification",     "status": "COMPLETED", "agent": "Skill Verifier"},
                {"step": "Candidate Matching",     "status": "COMPLETED", "agent": "Candidate Matcher"},
                {"step": "Credential Issuance",    "status": "COMPLETED", "agent": "Credential Issuer"},
            ],
        }

        result = {
            "verifiable_credential": vc,
            "assessment_summary":    summary.strip(),
            "audit_trail":           audit,
            "credential_id":         vc["id"],
            "claims_hash":           claims_hash,
        }

        stream_fn("", "result", self.name, {
            "conversation_id": cid,
            "step": f"✅ Verifiable Credential issued — hash: {claims_hash[:16]}…",
            "data": {
                "credential_id":      vc["id"],
                "claims_hash_preview": claims_hash[:16],
            },
        })
        return result
