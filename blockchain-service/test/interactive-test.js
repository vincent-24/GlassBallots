import readline from 'readline';
import userDB from '../database/db.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function interactiveTest() {
    console.log('Interactive Database Test\n');
    
    while (true) {
        console.log('\nChoose an option:');
        console.log('1. Create a user');
        console.log('2. Find a user by wallet');
        console.log('3. Update user profile');
        console.log('4. Get user profile');
        console.log('5. Create session');
        console.log('6. Validate session');
        console.log('7. Run all tests automatically');
        console.log('8. Exit');

        const choice = await askQuestion('\nEnter your choice (1-8): ');

        try {
            switch (choice) {
                case '1':
                    await testCreateUser();
                    break;
                case '2':
                    await testFindUser();
                    break;
                case '3':
                    await testUpdateProfile();
                    break;
                case '4':
                    await testGetProfile();
                    break;
                case '5':
                    await testCreateSession();
                    break;
                case '6':
                    await testValidateSession();
                    break;
                case '7':
                    await runAutomaticTests();
                    break;
                case '8':
                    console.log('👋 Goodbye!');
                    userDB.close();
                    rl.close();
                    return;
                default:
                    console.log('Invalid choice');
            }
        } catch (error) {
            console.log('Error:', error.message);
        }
    }
}

async function testCreateUser() {
    console.log('\n--- Create User ---');
    const wallet = await askQuestion('Wallet address: ');
    const email = await askQuestion('Email: ');
    const username = await askQuestion('Username: ');
    const role = await askQuestion('Role (student/council/admin): ') || 'student';

    const user = await userDB.createUser({ walletAddress: wallet, email, username, role });
    console.log('User created:', user);
}

async function testFindUser() {
    console.log('\n--- Find User ---');
    const wallet = await askQuestion('Wallet address to find: ');
    const user = await userDB.getUserByWallet(wallet);
    console.log('User found:', user);
}

async function testUpdateProfile() {
    console.log('\n--- Update Profile ---');
    const wallet = await askQuestion('Wallet address: ');
    const user = await userDB.getUserByWallet(wallet);
    
    if (!user) {
        console.log('User not found');
        return;
    }

    const fullName = await askQuestion('Full name: ');
    const studentId = await askQuestion('Student ID: ');
    const major = await askQuestion('Major: ');

    await userDB.updateUserProfile(user.id, { fullName, studentId, major });
    console.log('Profile updated');
}

async function testGetProfile() {
    console.log('\n--- Get Profile ---');
    const wallet = await askQuestion('Wallet address: ');
    const user = await userDB.getUserByWallet(wallet);
    
    if (!user) {
        console.log('User not found');
        return;
    }

    const profile = await userDB.getUserProfile(user.id);
    console.log('Profile:', profile);
}

async function testCreateSession() {
    console.log('\n--- Create Session ---');
    const wallet = await askQuestion('Wallet address: ');
    const user = await userDB.getUserByWallet(wallet);
    
    if (!user) {
        console.log('User not found');
        return;
    }

    const session = await userDB.createSession(user.id);
    console.log('Session created:', session);
}

async function testValidateSession() {
    console.log('\n--- Validate Session ---');
    const token = await askQuestion('Session token: ');
    const session = await userDB.validateSession(token);
    console.log('Session validation:', session);
}

async function runAutomaticTests() {
    console.log('\n--- Running Automatic Tests ---');
    // You can copy the test-database.js content here or require it
    const testScript = await import('./test-database.js');
}

// Start interactive test
interactiveTest();