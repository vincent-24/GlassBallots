/**
 * Votes Routes
 * 
 * Handles voting operations:
 * - Cast votes (record in DB, interact with smart contract)
 * - Get voting results
 * - Check if user has voted
 * 
 * HYBRID WORKFLOW:
 * The frontend creates the blockchain transaction via MetaMask, then sends
 * the transactionHash to this API. We verify the transaction on-chain and
 * sync the result to SQLite for fast dashboard queries.
 */

import express from 'express';
import { ethers } from 'ethers';
import userDB from '../../database/db.js';
import blockchainConfig, { VOTE_FUNCTION_SELECTOR } from '../../config/blockchain.js';

const router = express.Router();

// Initialize ethers provider
let provider;
try {
    provider = new ethers.JsonRpcProvider(blockchainConfig.rpcUrl);
    console.log(`Connected to blockchain provider at ${blockchainConfig.rpcUrl}`);
} catch (error) {
    console.error('Failed to initialize blockchain provider:', error.message);
}

/**
 * POST /api/votes/submit
 * Submit a vote using username (simpler than wallet-based)
 */
router.post('/submit', async (req, res) => {
    try {
        const { proposal_id, username, vote } = req.body;
        
        if (!proposal_id || !username || !vote) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: proposal_id, username, vote'
            });
        }

        if (vote !== 'approve' && vote !== 'deny') {
            return res.status(400).json({
                success: false,
                error: 'Vote must be either "approve" or "deny"'
            });
        }

        // Get user by username
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if user is allowed to vote on this proposal
        const canVote = await userDB.canUserVoteOnProposal(user.id, parseInt(proposal_id));
        if (!canVote.canVote) {
            return res.status(403).json({
                success: false,
                error: canVote.reason || 'You are not allowed to vote on this proposal',
                restricted: canVote.restricted || false
            });
        }

        // Submit vote
        const voteValue = vote === 'approve';
        await userDB.submitVote(user.id, parseInt(proposal_id), voteValue);

        // Get updated tallies
        const tallies = await userDB.getVoteTallies(parseInt(proposal_id));

        res.status(201).json({
            success: true,
            message: 'Vote recorded successfully',
            tallies
        });

    } catch (error) {
        console.error('Error submitting vote:', error);
        if (error.message.includes('already voted')) {
            return res.status(409).json({
                success: false,
                error: error.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to submit vote'
        });
    }
});

/**
 * GET /api/votes/:proposalId/can-vote/:username
 * Check if a user can vote on a proposal (considering restrictions)
 */
router.get('/:proposalId/can-vote/:username', async (req, res) => {
    try {
        const { proposalId, username } = req.params;
        
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const result = await userDB.canUserVoteOnProposal(user.id, parseInt(proposalId));
        
        res.json({
            success: true,
            can_vote: result.canVote,
            reason: result.reason || null,
            already_voted: result.alreadyVoted || false,
            restricted: result.restricted || false
        });
    } catch (error) {
        console.error('Error checking vote permission:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check voting permission'
        });
    }
});

/**
 * POST /api/votes/cast
 * Cast a vote on a proposal (blockchain-verified hybrid workflow)
 * 
 * WORKFLOW:
 * 1. Frontend creates transaction via MetaMask and sends transactionHash
 * 2. API verifies transaction on-chain:
 *    - Confirms it was sent by the claimed wallet address
 *    - Confirms it interacted with the correct Ballot contract
 *    - Confirms it called vote() with the correct proposalId
 * 3. On successful verification, sync vote to SQLite database
 * 4. Return success with updated tallies
 * 
 * REQUEST BODY:
 * {
 *   transactionHash: string,  // The blockchain transaction hash from MetaMask
 *   proposalId: number,       // The proposal being voted on
 *   voteValue: boolean,       // true = yes/approve, false = no/deny
 *   walletAddress: string,    // The voter's wallet address
 *   userId?: number           // Optional: the user's database ID
 * }
 */
router.post('/cast', async (req, res) => {
    try {
        const { transactionHash, proposalId, voteValue, walletAddress, userId } = req.body;
        
        // ============================================
        // STEP 1: Validate required fields
        // ============================================
        if (!transactionHash || proposalId === undefined || voteValue === undefined || !walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['transactionHash', 'proposalId', 'voteValue', 'walletAddress']
            });
        }

        // Validate transaction hash format (0x + 64 hex chars)
        if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction hash format'
            });
        }

        // Validate wallet address format
        if (!ethers.isAddress(walletAddress)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address format'
            });
        }

        // ============================================
        // STEP 2: Check for double voting in database
        // ============================================
        // First, try to find user by wallet address
        let user = await userDB.getUserByWallet(walletAddress);
        let effectiveUserId = userId;
        
        if (user) {
            effectiveUserId = user.id;
            
            // Check if user already voted on this proposal
            const existingVote = await userDB.getUserVote(user.id, parseInt(proposalId));
            if (existingVote !== null) {
                return res.status(409).json({
                    success: false,
                    error: 'You have already voted on this proposal'
                });
            }
        }

        // ============================================
        // STEP 3: Verify contract address is configured
        // ============================================
        if (!blockchainConfig.ballotContractAddress) {
            console.error('BALLOT_CONTRACT_ADDRESS not configured');
            return res.status(500).json({
                success: false,
                error: 'Blockchain configuration error: Contract address not set'
            });
        }

        // ============================================
        // STEP 4: Fetch and verify the transaction
        // ============================================
        let tx;
        let txReceipt;
        
        try {
            // Fetch transaction details
            tx = await provider.getTransaction(transactionHash);
            
            if (!tx) {
                return res.status(400).json({
                    success: false,
                    error: 'Transaction not found on blockchain. It may be pending or invalid.'
                });
            }

            // Wait for transaction to be mined if still pending
            if (!tx.blockNumber) {
                console.log(`Transaction ${transactionHash} is pending, waiting for confirmation...`);
                txReceipt = await tx.wait(blockchainConfig.confirmations);
            } else {
                txReceipt = await provider.getTransactionReceipt(transactionHash);
            }

            if (!txReceipt) {
                return res.status(400).json({
                    success: false,
                    error: 'Could not retrieve transaction receipt'
                });
            }

            // Check if transaction was successful
            if (txReceipt.status !== 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Transaction failed on-chain (reverted)'
                });
            }

        } catch (error) {
            console.error('Error fetching transaction:', error);
            return res.status(400).json({
                success: false,
                error: 'Failed to fetch transaction from blockchain',
                details: error.message
            });
        }

        // ============================================
        // STEP 5: Verify transaction sender (from address)
        // ============================================
        const txSender = tx.from.toLowerCase();
        const claimedSender = walletAddress.toLowerCase();
        
        if (txSender !== claimedSender) {
            return res.status(400).json({
                success: false,
                error: 'Transaction sender does not match claimed wallet address',
                details: {
                    expected: claimedSender,
                    actual: txSender
                }
            });
        }

        // ============================================
        // STEP 6: Verify transaction target (to address)
        // ============================================
        const txTarget = tx.to?.toLowerCase();
        const contractAddress = blockchainConfig.ballotContractAddress.toLowerCase();
        
        if (txTarget !== contractAddress) {
            return res.status(400).json({
                success: false,
                error: 'Transaction was not sent to the Ballot contract',
                details: {
                    expected: contractAddress,
                    actual: txTarget
                }
            });
        }

        // ============================================
        // STEP 7: Verify function called and parameters
        // ============================================
        const txData = tx.data;
        
        // Check function selector (first 4 bytes of calldata)
        const functionSelector = txData.slice(0, 10); // 0x + 8 hex chars
        
        if (functionSelector.toLowerCase() !== VOTE_FUNCTION_SELECTOR.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: 'Transaction did not call the vote() function',
                details: {
                    expected: VOTE_FUNCTION_SELECTOR,
                    actual: functionSelector
                }
            });
        }

        // Decode the vote function parameters
        // vote(uint256 id, bool supportYes) - ABI encoded after function selector
        try {
            const iface = new ethers.Interface(blockchainConfig.ballotABI);
            const decodedData = iface.parseTransaction({ data: txData });
            
            if (!decodedData || decodedData.name !== 'vote') {
                return res.status(400).json({
                    success: false,
                    error: 'Could not decode vote function call'
                });
            }

            const txProposalId = decodedData.args[0]; // id (uint256)
            const txSupportYes = decodedData.args[1]; // supportYes (bool)

            // Verify proposal ID matches
            if (BigInt(txProposalId) !== BigInt(proposalId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Transaction proposal ID does not match claimed proposal ID',
                    details: {
                        expected: proposalId,
                        actual: txProposalId.toString()
                    }
                });
            }

            // Verify vote value matches
            if (txSupportYes !== voteValue) {
                return res.status(400).json({
                    success: false,
                    error: 'Transaction vote value does not match claimed vote value',
                    details: {
                        expected: voteValue,
                        actual: txSupportYes
                    }
                });
            }

        } catch (error) {
            console.error('Error decoding transaction data:', error);
            return res.status(400).json({
                success: false,
                error: 'Failed to decode transaction data',
                details: error.message
            });
        }

        // ============================================
        // STEP 8: All verifications passed - sync to database
        // ============================================
        try {
            // If we have a user in the database, record their vote
            if (effectiveUserId) {
                await userDB.submitVote(
                    effectiveUserId, 
                    parseInt(proposalId), 
                    voteValue, 
                    walletAddress,
                    transactionHash,
                    txReceipt.blockNumber
                );
            } else {
                // User not in database - we could create them or just log the vote
                // For now, we'll record a vote entry directly
                console.log(`Vote recorded on-chain for non-registered wallet: ${walletAddress}`);
                
                // Optionally create user entry for the wallet
                try {
                    const newUser = await userDB.createUser({
                        walletAddress: walletAddress,
                        email: null,
                        username: null,
                        role: 'voter'
                    });
                    effectiveUserId = newUser.id;
                    await userDB.submitVote(
                        effectiveUserId, 
                        parseInt(proposalId), 
                        voteValue, 
                        walletAddress,
                        transactionHash,
                        txReceipt.blockNumber
                    );
                } catch (createError) {
                    // User might already exist with this wallet - that's fine
                    console.log('Could not create user entry:', createError.message);
                }
            }

            // Get updated tallies from database
            const tallies = await userDB.getVoteTallies(parseInt(proposalId));

            // ============================================
            // STEP 9: Return success response
            // ============================================
            res.status(201).json({
                success: true,
                message: 'Vote verified and recorded successfully',
                data: {
                    transactionHash,
                    blockNumber: txReceipt.blockNumber,
                    proposalId: parseInt(proposalId),
                    voteValue,
                    walletAddress,
                    verified: true
                },
                tallies
            });

        } catch (error) {
            console.error('Database error while recording vote:', error);
            
            // If it's a duplicate vote error, return conflict
            if (error.message.includes('already voted')) {
                return res.status(409).json({
                    success: false,
                    error: 'Vote already recorded in database'
                });
            }
            
            // The vote was recorded on-chain but DB sync failed
            // This is a partial success - the blockchain is the source of truth
            return res.status(500).json({
                success: false,
                error: 'Vote recorded on blockchain but failed to sync to database',
                transactionHash,
                details: error.message
            });
        }

    } catch (error) {
        console.error('Error in /cast endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/votes/:proposalId/results
 * Get voting results for a proposal
 */
router.get('/:proposalId/results', async (req, res) => {
    try {
        const { proposalId } = req.params;
        const tallies = await userDB.getVoteTallies(parseInt(proposalId));
        
        res.json({
            success: true,
            results: tallies
        });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * GET /api/votes/:proposalId/user/:username
 * Check if a user has voted on a proposal
 */
router.get('/:proposalId/user/:username', async (req, res) => {
    try {
        const { proposalId, username } = req.params;
        
        // Get user by username
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userVote = await userDB.getUserVote(user.id, parseInt(proposalId));
        
        res.json({
            success: true,
            has_voted: !!userVote,
            vote: userVote
        });
    } catch (error) {
        console.error('Error checking vote:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

export default router;
