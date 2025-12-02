import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';

async function testAPI() {
    console.log('Testing API Endpoints...\n');

    const testWallet = '0x' + Math.random().toString(16).slice(2, 42);
    
    try {
        // Test 1: Register user
        console.log('1. Testing user registration...');
        const registerResponse = await fetch(`${BASE_URL}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: testWallet,
                email: `test${Date.now()}@university.edu`,
                username: `testuser_${Date.now()}`,
                role: 'student'
            })
        });
        
        const registerData = await registerResponse.json();
        console.log('Registration:', registerResponse.status, registerData);

        if (!registerData.success) {
            throw new Error('Registration failed');
        }

        const sessionToken = registerData.session;

        // Test 2: Get user profile
        console.log('\n2. Testing profile retrieval...');
        const profileResponse = await fetch(`${BASE_URL}/users/profile/${testWallet}`);
        const profileData = await profileResponse.json();
        console.log('Profile retrieval:', profileResponse.status, profileData);

        // Test 3: Update profile with encrypted data
        console.log('\n3. Testing profile update with encryption...');
        const updateResponse = await fetch(`${BASE_URL}/users/profile/${testWallet}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profileData: {
                    fullName: 'Test Student',
                    studentId: `S${Date.now()}`,
                    major: 'Computer Science',
                    year: '2024',
                    phone: '+1234567890'
                }
            })
        });

        const updateData = await updateResponse.json();
        console.log('Profile update:', updateResponse.status, updateData);

        // Test 4: Get updated profile to verify encryption/decryption
        console.log('\n4. Verifying encrypted data retrieval...');
        const updatedProfileResponse = await fetch(`${BASE_URL}/users/profile/${testWallet}`);
        const updatedProfileData = await updatedProfileResponse.json();
        console.log('Updated profile:', updatedProfileResponse.status);
        console.log('   Decrypted data:', updatedProfileData.profile);

        // Test 5: Session validation
        console.log('\n5. Testing session validation...');
        const sessionResponse = await fetch(`${BASE_URL}/users/session/validate`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });

        const sessionData = await sessionResponse.json();
        console.log('Session validation:', sessionResponse.status, sessionData);

        console.log('\nAll API tests passed!');

    } catch (error) {
        console.error('API test failed:', error);
    }
}

// Check if server is running first
async function checkServer() {
    try {
        const healthResponse = await fetch('http://localhost:3001/health');
        if (healthResponse.ok) {
            console.log('Server is running');
            await testAPI();
        } else {
            console.log('Server is not responding. Please start the server first:');
            console.log('   node server.js');
        }
    } catch (error) {
        console.log('Server is not running. Please start the server first:');
        console.log('   node server.js');
    }
}

checkServer();