/**
 * Smart Contract Deployment Script
 * 
 * Deploys Ballot and Feedback contracts to the configured network
 * Compatible with Hardhat 3.x - using raw viem with Hardhat artifacts
 */

import hre from 'hardhat';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

async function main() {
    console.log('Starting contract deployment...\n');
    
    // For hardhat local network, use default accounts
    // Account #0 from Hardhat's default mnemonic
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const account = privateKeyToAccount(privateKey);
    
    // Create viem clients
    const publicClient = createPublicClient({
        chain: hardhat,
        transport: http('http://127.0.0.1:8545'),
    });
    
    const walletClient = createWalletClient({
        account,
        chain: hardhat,
        transport: http('http://127.0.0.1:8545'),
    });
    
    console.log('Deploying contracts with account:', account.address);
    console.log('Network:', hre.network.name);
    console.log('');
    
    // Read artifacts
    const ballotArtifact = await hre.artifacts.readArtifact('Ballot');
    const feedbackArtifact = await hre.artifacts.readArtifact('Feedback');
    
    // Deploy Ballot contract
    console.log('Deploying Ballot contract...');
    const ballotHash = await walletClient.deployContract({
        abi: ballotArtifact.abi,
        bytecode: ballotArtifact.bytecode,
    });
    
    const ballotReceipt = await publicClient.waitForTransactionReceipt({ hash: ballotHash });
    const ballotAddress = ballotReceipt.contractAddress;
    console.log('Ballot deployed to:', ballotAddress);
    console.log('');
    
    // Deploy Feedback contract
    console.log('Deploying Feedback contract...');
    const feedbackHash = await walletClient.deployContract({
        abi: feedbackArtifact.abi,
        bytecode: feedbackArtifact.bytecode,
    });
    
    const feedbackReceipt = await publicClient.waitForTransactionReceipt({ hash: feedbackHash });
    const feedbackAddress = feedbackReceipt.contractAddress;
    console.log('Feedback deployed to:', feedbackAddress);
    console.log('');
    
    // Save deployment addresses
    const fs = await import('fs');
    const path = await import('path');
    
    const deploymentInfo = {
        network: hre.network.name,
        deployer: account.address,
        contracts: {
            Ballot: ballotAddress,
            Feedback: feedbackAddress
        },
        timestamp: new Date().toISOString()
    };
    
    const deploymentsDir = path.join(process.cwd(), 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentsDir, `${hre.network.name}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log('Deployment info saved to:', deploymentFile);
    console.log('');
    console.log('Deployment completed successfully!');
    console.log('');
    console.log('Contract Addresses:');
    console.log('  Ballot:  ', ballotAddress);
    console.log('  Feedback:', feedbackAddress);
    console.log('');
    console.log('Add this to your .env file:');
    console.log(`  BALLOT_CONTRACT_ADDRESS=${ballotAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Deployment failed:', error);
        process.exit(1);
    });
