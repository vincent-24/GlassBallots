/**
 * Blockchain Configuration
 * 
 * Contains contract addresses, ABIs, and provider configuration
 * for connecting to the Ballot smart contract.
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the Ballot contract ABI from artifacts
const ballotArtifactPath = path.join(__dirname, '../artifacts/contracts/Ballot.sol/Ballot.json');
let BALLOT_ABI;

try {
    const artifact = JSON.parse(readFileSync(ballotArtifactPath, 'utf8'));
    BALLOT_ABI = artifact.abi;
} catch (error) {
    console.error('Warning: Could not load Ballot ABI from artifacts:', error.message);
    // Minimal ABI for the vote function - fallback
    BALLOT_ABI = [
        {
            "inputs": [
                { "internalType": "uint256", "name": "id", "type": "uint256" },
                { "internalType": "bool", "name": "supportYes", "type": "bool" }
            ],
            "name": "vote",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                { "internalType": "uint256", "name": "id", "type": "uint256" },
                { "internalType": "address", "name": "account", "type": "address" }
            ],
            "name": "hasVoted",
            "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "anonymous": false,
            "inputs": [
                { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
                { "indexed": true, "internalType": "address", "name": "voter", "type": "address" },
                { "indexed": false, "internalType": "bool", "name": "supportYes", "type": "bool" },
                { "indexed": false, "internalType": "uint256", "name": "yes", "type": "uint256" },
                { "indexed": false, "internalType": "uint256", "name": "no", "type": "uint256" }
            ],
            "name": "Voted",
            "type": "event"
        }
    ];
}

// Blockchain configuration
const blockchainConfig = {
    // RPC Provider URL
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545',
    
    // Contract address - should be set after deployment
    // You can set this via environment variable or update after deploying
    ballotContractAddress: process.env.BALLOT_CONTRACT_ADDRESS || null,
    
    // Contract ABI
    ballotABI: BALLOT_ABI,
    
    // Network configuration
    network: process.env.BLOCKCHAIN_NETWORK || 'hardhatMainnet',
    
    // Transaction confirmation settings
    confirmations: parseInt(process.env.TX_CONFIRMATIONS) || 1,
    
    // Timeout for waiting on transactions (in ms)
    txTimeout: parseInt(process.env.TX_TIMEOUT) || 60000,
};

// Function selector for vote(uint256,bool) = keccak256("vote(uint256,bool)")[0:4]
// This is used to verify the transaction called the correct function
export const VOTE_FUNCTION_SELECTOR = '0xc9d27afe';

export default blockchainConfig;
