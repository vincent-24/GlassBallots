"""
AI Service - Flask API for Proposal Analysis

This microservice provides AI-powered analysis of proposals using OpenAI GPT-4o.
It exposes a REST API endpoint for analyzing proposal texts.

Endpoints:
- POST /analyze - Analyze a proposal text
- GET /health - Health check endpoint
"""

import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import logging

# Import the analyst module
from analyst import ProposalAnalyst

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configure CORS
cors_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(',')
CORS(app, origins=cors_origins)

# Initialize the analyst
try:
    analyst = ProposalAnalyst()
    logger.info("ProposalAnalyst initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize ProposalAnalyst: {e}")
    sys.exit(1)


@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.
    
    Returns:
        JSON response with status and service information
    """
    return jsonify({
        'status': 'healthy',
        'service': 'ai-service',
        'version': '1.0.0',
        'openai_configured': bool(os.getenv('OPENAI_API_KEY'))
    }), 200


@app.route('/analyze', methods=['POST'])
def analyze_proposal():
    """
    Analyze a proposal text for bias and generate neutral summary.
    
    Request Body:
        {
            "text": "Proposal text to analyze"
        }
    
    Returns:
        JSON response with:
        - summary: Neutral summary of the proposal
        - loaded_language: List of biased words/phrases detected
        - stakeholders: List of stakeholder groups mentioned
        - equity_concerns: List of fairness questions to consider
        - objective_facts: Structured data of objective facts
    """
    try:
        # Validate request
        if not request.is_json:
            return jsonify({
                'error': 'Content-Type must be application/json'
            }), 400
        
        data = request.get_json()
        
        # Check for required field
        if 'text' not in data:
            return jsonify({
                'error': 'Missing required field: text'
            }), 400
        
        proposal_text = data['text']
        
        # Validate text length
        if not proposal_text or len(proposal_text.strip()) < 50:
            return jsonify({
                'error': 'Proposal text must be at least 50 characters long'
            }), 400
        
        if len(proposal_text) > 50000:
            return jsonify({
                'error': 'Proposal text must be less than 50,000 characters'
            }), 400
        
        logger.info(f"Analyzing proposal of length {len(proposal_text)} characters")
        
        # Perform analysis
        results = analyst.analyze(proposal_text)
        
        # Format response
        response = {
            'success': True,
            'summary': results['neutral_summary'],
            'loaded_language': results['bias_report']['loaded_language_flags'],
            'stakeholders': results['bias_report']['stakeholders_mentioned'],
            'equity_concerns': results['bias_report']['questions_for_consideration'],
            'objective_facts': results['objective_facts']
        }
        
        logger.info("Analysis completed successfully")
        return jsonify(response), 200
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error during analysis',
            'details': str(e) if os.getenv('DEBUG') == 'true' else None
        }), 500


@app.route('/analyze/batch', methods=['POST'])
def analyze_batch():
    """
    Analyze multiple proposals in a single request.
    
    Request Body:
        {
            "proposals": [
                {"id": 1, "text": "Proposal 1 text"},
                {"id": 2, "text": "Proposal 2 text"}
            ]
        }
    
    Returns:
        JSON response with array of analysis results
    """
    try:
        if not request.is_json:
            return jsonify({
                'error': 'Content-Type must be application/json'
            }), 400
        
        data = request.get_json()
        
        if 'proposals' not in data or not isinstance(data['proposals'], list):
            return jsonify({
                'error': 'Missing or invalid field: proposals (must be an array)'
            }), 400
        
        if len(data['proposals']) > 10:
            return jsonify({
                'error': 'Maximum 10 proposals per batch request'
            }), 400
        
        results = []
        
        for proposal in data['proposals']:
            if 'id' not in proposal or 'text' not in proposal:
                results.append({
                    'success': False,
                    'error': 'Each proposal must have id and text fields'
                })
                continue
            
            try:
                analysis = analyst.analyze(proposal['text'])
                results.append({
                    'success': True,
                    'id': proposal['id'],
                    'summary': analysis['neutral_summary'],
                    'loaded_language': analysis['bias_report']['loaded_language_flags'],
                    'stakeholders': analysis['bias_report']['stakeholders_mentioned'],
                    'equity_concerns': analysis['bias_report']['questions_for_consideration'],
                    'objective_facts': analysis['objective_facts']
                })
            except Exception as e:
                logger.error(f"Error analyzing proposal {proposal['id']}: {e}")
                results.append({
                    'success': False,
                    'id': proposal['id'],
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'results': results
        }), 200
        
    except Exception as e:
        logger.error(f"Batch analysis error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error during batch analysis'
        }), 500


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'error': 'Endpoint not found',
        'available_endpoints': [
            'GET /health',
            'POST /analyze',
            'POST /analyze/batch'
        ]
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {error}", exc_info=True)
    return jsonify({
        'error': 'Internal server error'
    }), 500


# Get port from environment variable
AI_SERVICE_PORT = int(os.getenv('AI_SERVICE_PORT', 5001))

if __name__ == '__main__':
    # Check for OpenAI API key
    if not os.getenv('OPENAI_API_KEY'):
        logger.error("OPENAI_API_KEY environment variable not set")
        logger.error("Please set OPENAI_API_KEY in your .env file")
        sys.exit(1)
    
    logger.info(f"Starting AI Service on port {AI_SERVICE_PORT}")
    logger.info(f"CORS enabled for origins: {cors_origins}")
    
    # Run the Flask app
    app.run(
        host='0.0.0.0',
        port=AI_SERVICE_PORT,
        debug=os.getenv('DEBUG', 'false').lower() == 'true'
    )
