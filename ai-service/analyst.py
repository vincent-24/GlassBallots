"""
ProposalAnalyst: A multi-step pipeline for analyzing proposal texts.

This module analyzes proposals to generate neutral summaries and bias/fairness reports
using a combination of spaCy (for text processing) and OpenAI's API.
"""

import os
import json
import re
from typing import Dict, List, Any
import spacy
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class ProposalAnalyst:
    """
    A class to analyze proposal texts for bias and generate neutral summaries.
    
    This class implements a multi-step pipeline that:
    1. Identifies loaded language using regex pattern matching
    2. Identifies stakeholders using pattern matching
    3. Generates equity concerns using OpenAI API
    4. Extracts objective facts using OpenAI API
    5. Generates neutral summary from objective facts
    """
    
    LOADED_WORDS = [
        "disastrous", "unprecedented", "clearly", "obviously", 
        "everyone knows", "without a doubt", "terrible", "perfect",
        "absolutely", "catastrophic", "revolutionary", "game-changing",
        "undeniable", "irrefutable", "certainly", "inevitably"
    ]
    
    STAKEHOLDER_GROUPS = [
        "commuter students", "international students", "adjunct faculty",
        "full-time faculty", "part-time students", "graduate students",
        "undergraduate students", "administrative staff", "support staff",
        "disabled students", "minority students", "low-income students",
        "local community", "alumni", "parents"
    ]
    
    def __init__(self):
        """
        Initialize the ProposalAnalyst with necessary models.
        
        Loads spaCy model and initializes OpenAI client.
        """
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            print("Downloading spaCy model 'en_core_web_sm'...")
            os.system("python -m spacy download en_core_web_sm")
            self.nlp = spacy.load("en_core_web_sm")
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        self.client = OpenAI(api_key=api_key)
    
    def _find_loaded_language(self, text: str) -> List[str]:
        """
        Find loaded language in the proposal text.
        
        This implementation searches for hard-coded loaded words and phrases
        that indicate bias or persuasive language.
        
        Args:
            text: The proposal text to analyze
            
        Returns:
            List of loaded phrases found in the text
        """
        text_lower = text.lower()
        found_phrases = []
        
        for loaded_word in self.LOADED_WORDS:
            pattern = r'\b' + re.escape(loaded_word) + r'\b'
            if re.search(pattern, text_lower):
                found_phrases.append(loaded_word)
        
        return found_phrases
    
    def _find_stakeholders(self, text: str) -> List[str]:
        """
        Find stakeholder groups mentioned in the proposal.
        
        This implementation searches for hard-coded stakeholder groups
        commonly affected by institutional policies.
        
        Args:
            text: The proposal text to analyze
            
        Returns:
            List of stakeholder groups found in the text
        """
        text_lower = text.lower()
        found_stakeholders = []
        
        for stakeholder in self.STAKEHOLDER_GROUPS:
            pattern = r'\b' + re.escape(stakeholder) + r'\b'
            if re.search(pattern, text_lower):
                found_stakeholders.append(stakeholder)
        
        return found_stakeholders
    
    def _get_unspoken_concerns(self, text: str, stakeholders: List[str]) -> List[str]:
        """
        Use OpenAI API to identify potential equity concerns not addressed in the text.
        
        Args:
            text: The proposal text to analyze
            stakeholders: List of stakeholder groups found in the text
            
        Returns:
            List of equity concerns and questions for consideration
        """
        stakeholders_str = ", ".join(stakeholders) if stakeholders else "no specific groups"
        
        prompt = f"""You are an equity and fairness analyst reviewing a proposal.

The proposal mentions the following stakeholder groups: {stakeholders_str}

Proposal text:
{text}

Based on the stakeholder groups mentioned (or not mentioned), identify potential equity concerns that may not be adequately addressed in this proposal. Consider:

1. Which groups might be disproportionately affected but are not mentioned?
2. What access or resource disparities might this proposal create or perpetuate?
3. What unintended consequences might affect marginalized or underrepresented groups?
4. What questions should decision-makers ask to ensure fairness?

Provide 3-5 specific, actionable questions or concerns for consideration. Format your response as a numbered list."""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert in equity analysis and social justice, focused on identifying potential fairness concerns in institutional policies and proposals."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        concerns_text = response.choices[0].message.content.strip()
        concerns = [
            line.strip().lstrip('0123456789.-)• ').strip()
            for line in concerns_text.split('\n')
            if line.strip() and any(c.isalnum() for c in line)
        ]
        
        return concerns
    
    def _extract_objective_facts(self, text: str) -> Dict[str, Any]:
        """
        Use OpenAI API to extract objective facts from the proposal.
        
        This method forces the LLM to return a JSON object containing only
        objective facts, ignoring persuasive or emotional language.
        
        Args:
            text: The proposal text to analyze
            
        Returns:
            Dictionary containing objective facts extracted from the proposal
        """
        prompt = f"""You are a fact extraction system. Your job is to extract ONLY objective, verifiable facts from the following proposal text.

IGNORE all of the following:
- Persuasive language
- Emotional appeals
- Opinions or value judgments
- Predictions or speculative statements
- Loaded or biased language

Extract and return ONLY:
- The main objective or goal (stated factually)
- Key actions or steps proposed
- Specific numbers, dates, or quantitative data
- Concrete resources or costs mentioned
- Specific entities, locations, or groups named

Proposal text:
{text}

You MUST respond with a valid JSON object using this exact structure:
{{
  "main_objective": "The primary goal stated in the proposal",
  "key_actions": ["Action 1", "Action 2", "Action 3"],
  "quantitative_data": {{"item": "value"}},
  "cost": "Specific cost if mentioned, or 'not specified'",
  "timeline": "Specific timeline if mentioned, or 'not specified'",
  "target_groups": ["Group 1", "Group 2"],
  "resources_required": ["Resource 1", "Resource 2"]
}}

Return ONLY the JSON object, no other text."""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a fact extraction system that returns only valid JSON. You ignore all persuasive language and extract only objective, verifiable facts."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1, 
            max_tokens=800,
            response_format={"type": "json_object"}
        )
        
        facts_json_str = response.choices[0].message.content.strip()
        facts_json = json.loads(facts_json_str)
        
        return facts_json
    
    def _generate_neutral_summary(self, facts_json: Dict[str, Any]) -> str:
        """
        Use OpenAI API to generate a neutral summary from objective facts.
        
        This method takes only the JSON object of facts and synthesizes them
        into a plain-language summary without bias or persuasion.
        
        Args:
            facts_json: Dictionary of objective facts
            
        Returns:
            Neutral summary string
        """
        facts_str = json.dumps(facts_json, indent=2)
        
        prompt = f"""You are a neutral summarizer. Using ONLY the objective facts provided below, write a clear, plain-language summary of this proposal.

Your summary must:
- Be written in neutral, factual language
- Avoid all persuasive or emotional language
- State only what is proposed, not why it should be approved
- Be 3-5 sentences long
- Be accessible to a general audience

Objective facts:
{facts_str}

Write a neutral summary based solely on these facts:"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a neutral summarizer who writes clear, factual summaries without bias, persuasion, or emotional language."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=300
        )
        
        summary = response.choices[0].message.content.strip()
        return summary
    
    def analyze(self, proposal_text: str) -> Dict[str, Any]:
        """
        Execute the full analysis pipeline on a proposal text.
        
        This method orchestrates all the analysis steps:
        1. Find loaded language
        2. Find stakeholders
        3. Get unspoken equity concerns
        4. Extract objective facts
        5. Generate neutral summary
        
        Args:
            proposal_text: The full text of the proposal to analyze
            
        Returns:
            Dictionary containing:
            - neutral_summary: Plain-language summary based on facts
            - bias_report: Dictionary with loaded language, stakeholders, and equity concerns
            - objective_facts: Dictionary of extracted facts
        """
        # 1. Detect loaded language
        loaded_language = self._find_loaded_language(proposal_text)
        
        # 2. Identify stakeholder groups
        stakeholders = self._find_stakeholders(proposal_text)
        
        # 3. Analyze equity concerns
        equity_concerns = self._get_unspoken_concerns(proposal_text, stakeholders)
        
        # 4. Extract objective facts
        objective_facts = self._extract_objective_facts(proposal_text)
        
        # 5. Generate neutral summary
        neutral_summary = self._generate_neutral_summary(objective_facts)
        
        return {
            "neutral_summary": neutral_summary,
            "bias_report": {
                "loaded_language_flags": loaded_language,
                "stakeholders_mentioned": stakeholders,
                "questions_for_consideration": equity_concerns
            },
            "objective_facts": objective_facts
        }
