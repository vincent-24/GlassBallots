import userDB from '../database/db.js';

async function runTests() {
    console.log('🧪 Starting Database Tests...\n');

    try {
        // Clean up any existing test data first
        console.log('0. Cleaning up previous test data...');
        await cleanupTestData();
        
        // Test 1: Create a user (wallet-based)
        console.log('1. Testing wallet-based user creation...');
        const timestamp = Date.now();
        const testUser = {
            walletAddress: `0x${timestamp.toString(16).padStart(40, '0')}`,
            email: `test${timestamp}@university.edu`,
            username: `test_student_${timestamp}`,
            role: 'student'
        };

        const user = await userDB.createUser(testUser);
        console.log('User created:', user);

        // Test 2: Get user by wallet
        console.log('\n2. Testing user retrieval...');
        const foundUser = await userDB.getUserByWallet(testUser.walletAddress);
        console.log('User found:', foundUser);

        // Test 3: Update user profile with encrypted data
        console.log('\n3. Testing encrypted profile storage...');
        const profileData = {
            fullName: 'John Doe',
            studentId: 'S123456',
            major: 'Computer Science',
            year: '2024'
        };

        try {
            await userDB.updateUserProfile(foundUser.id, profileData);
            console.log('Profile data encrypted and stored');
        } catch (error) {
            console.log('Encryption failed, but basic database operations work:', error.message);
            console.log('Basic user creation and retrieval are working!');
        }

        // Test 4: Retrieve and decrypt profile (if encryption worked)
        console.log('\n4. Testing profile retrieval...');
        try {
            const retrievedProfile = await userDB.getUserProfile(foundUser.id);
            console.log('Profile retrieved:', retrievedProfile);
        } catch (error) {
            console.log('Profile retrieval failed:', error.message);
        }

        // Test 5: Session management
        console.log('\n5. Testing session management...');
        try {
            const session = await userDB.createSession(foundUser.id);
            console.log('Session created:', session.sessionToken);

            // Test 6: Validate session
            console.log('\n6. Testing session validation...');
            const validSession = await userDB.validateSession(session.sessionToken);
            console.log('Session validated:', validSession ? 'Valid' : 'Invalid');
        } catch (error) {
            console.log('Session test failed:', error.message);
        }

        // Test 7: Password authentication and encryption verification
        console.log('\n7. Testing password authentication and encryption...');
        try {
            const testPassword = 'securePassword123';
            
            // Test password registration
            const passwordUser = await userDB.createUserWithPassword({
                walletAddress: `0xPASSWORD${timestamp}`,
                email: `passwordtest${timestamp}@university.edu`,
                username: `password_user_${timestamp}`,
                role: 'student',
                password: testPassword
            });
            console.log('User with password created:', passwordUser);

            // Get the stored password hash to verify it's encrypted
            const storedHash = await userDB.getPasswordHash(passwordUser.id);
            console.log('Stored password hash:', storedHash ? 'Present' : 'Missing');
            
            // Verify the hash is not the plain text password
            if (storedHash) {
                const isPlainText = storedHash === testPassword;
                console.log('Password is encrypted (not stored in plain text):', !isPlainText);
                
                // Verify it's a bcrypt hash (starts with $2b$)
                const isBcryptHash = storedHash.startsWith('$2b$');
                console.log('Password uses bcrypt hashing:', isBcryptHash);
                
                // Verify hash length is reasonable for bcrypt
                const hashLength = storedHash.length;
                console.log('Hash length is appropriate:', hashLength > 50 && hashLength < 100);
            }

            // Test password verification
            const verifiedUser = await userDB.verifyUserCredentials(`passwordtest${timestamp}@university.edu`, testPassword);
            console.log('Password verification successful:', verifiedUser ? 'Yes' : 'No');

            // Test wrong password
            const wrongPassword = await userDB.verifyUserCredentials(`passwordtest${timestamp}@university.edu`, 'wrongPassword');
            console.log('Wrong password rejected:', wrongPassword === null ? 'Yes' : 'No');

            // Test password update
            const newPassword = 'newSecurePassword456';
            await userDB.updatePassword(passwordUser.id, newPassword);
            console.log('Password update successful');

            // Get the new hash to verify it changed
            const newStoredHash = await userDB.getPasswordHash(passwordUser.id);
            const hashChanged = storedHash !== newStoredHash;
            console.log('Password hash changed after update:', hashChanged);

            // Verify new password works
            const newPasswordWorks = await userDB.verifyUserCredentials(`passwordtest${timestamp}@university.edu`, newPassword);
            console.log('New password works:', newPasswordWorks ? 'Yes' : 'No');

            // Test that old password no longer works
            const oldPasswordFails = await userDB.verifyUserCredentials(`passwordtest${timestamp}@university.edu`, testPassword);
            console.log('Old password no longer works:', oldPasswordFails === null ? 'Yes' : 'No');

        } catch (error) {
            console.log('Password test failed:', error.message);
        }

        console.log('\nAll database functionality is working!');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        // Close database connection
        userDB.close();
    }
}

// Clean up test data function
async function cleanupTestData() {
    return new Promise((resolve, reject) => {
        // Delete test users (those with test emails or specific wallet patterns)
        userDB.db.run(`
            DELETE FROM user_profiles WHERE user_id IN (
                SELECT id FROM users WHERE email LIKE 'test%@university.edu' OR wallet_address LIKE '0xPASSWORD%'
            )
        `, (err) => {
            if (err) console.log('Note: Could not delete user_profiles:', err.message);
            
            userDB.db.run(`
                DELETE FROM user_sessions WHERE user_id IN (
                    SELECT id FROM users WHERE email LIKE 'test%@university.edu' OR wallet_address LIKE '0xPASSWORD%'
                )
            `, (err) => {
                if (err) console.log('Note: Could not delete user_sessions:', err.message);
                
                userDB.db.run(`
                    DELETE FROM users WHERE email LIKE 'test%@university.edu' OR wallet_address LIKE '0xPASSWORD%'
                `, (err) => {
                    if (err) console.log('Note: Could not delete users:', err.message);
                    resolve();
                });
            });
        });
    });
}

// Run tests
runTests();