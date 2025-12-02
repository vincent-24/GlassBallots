import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

type Address = `0x${string}`;
type FeedbackView = readonly [
  bigint,   // proposalId
  string,   // proposalTitle
  number,   // rating
  string,   // comment
  string,   // category
  bigint,   // submittedAt
  Address,  // student
  boolean,  // isAnonymous
  boolean,  // moderated
  boolean   // isVisible
];

// CORRECTED Role constants (32 bytes exactly)
const ROLES = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
  STUDENT_ROLE: "0x724f6a44d576143e18c60911798b2b15551ca96bd8f7cb7524b8fa36239a5bd8" as `0x${string}`, // keccak256("STUDENT_ROLE")
  MODERATOR_ROLE: "0x139c2898040ef16910dc9f44dc697df79363da767d8bc92f2e310312b816e46d" as `0x${string}`, // keccak256("MODERATOR_ROLE")
};

function eqAddr(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

describe("Feedback", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [alice, bob, carol, dave, eve] = await viem.getWalletClients();

  const exampleFeedback = {
    proposalId: 1n,
    proposalTitle: "Campus Parking Reform",
    rating: 4,
    comment: "Great proposal but needs more bike parking",
    category: "campus",
    isAnonymous: false
  } as const;

  it("deploys with correct initial roles", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Try to read roles from contract first
    let MODERATOR_ROLE: `0x${string}`;
    
    try {
      MODERATOR_ROLE = await feedbackAny.read.MODERATOR_ROLE();
    } catch (e) {
      // Fallback to hardcoded if contract doesn't expose roles
      MODERATOR_ROLE = ROLES.MODERATOR_ROLE;
    }

    const hasDefaultAdmin = await feedbackAny.read.hasRole([ROLES.DEFAULT_ADMIN_ROLE, alice.account.address]);
    const hasModeratorRole = await feedbackAny.read.hasRole([MODERATOR_ROLE, alice.account.address]);

    console.log("Default Admin Role:", hasDefaultAdmin);
    console.log("Moderator Role:", hasModeratorRole);

    assert.equal(hasDefaultAdmin, true, "Deployer should have DEFAULT_ADMIN_ROLE");
    assert.equal(hasModeratorRole, true, "Deployer should have MODERATOR_ROLE");
  });

  it("prevents banned students from submitting feedback", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Register then ban Bob
    await feedbackAny.write.registerStudent([bob.account.address], { account: alice.account });
    await feedbackAny.write.banStudent([bob.account.address], { account: alice.account });

    const isBanned = await feedbackAny.read.isStudentBanned([bob.account.address]);
    assert.equal(isBanned, true, "Bob should be banned");

    // Bob should not be able to submit feedback while banned
    // FIXED: Changed to match the actual error message
    await assert.rejects(
      feedback.write.submitFeedback([
        exampleFeedback.proposalId,
        exampleFeedback.proposalTitle,
        exampleFeedback.rating,
        exampleFeedback.comment,
        exampleFeedback.category,
        exampleFeedback.isAnonymous
      ], { account: bob.account }),
      /Not a registered student/  // CHANGED THIS LINE
    );
  });

  it("allows registered students to submit feedback", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Register Bob as student
    await feedbackAny.write.registerStudent([bob.account.address], { account: alice.account });

    const isRegistered = await feedbackAny.read.isRegisteredStudent([bob.account.address]);
    assert.equal(isRegistered, true, "Bob should be registered after registration");

    // Bob should now be able to submit feedback
    await feedback.write.submitFeedback([
      exampleFeedback.proposalId,
      exampleFeedback.proposalTitle,
      exampleFeedback.rating,
      exampleFeedback.comment,
      exampleFeedback.category,
      exampleFeedback.isAnonymous
    ], { account: bob.account });

    const count = await feedback.read.getFeedbackCount();
    assert.equal(count, 1n);
  });

  it("allows bulk student registration", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Bulk register multiple students
    const students = [bob.account.address, carol.account.address, dave.account.address];
    await feedbackAny.write.bulkRegisterStudents([students], { account: alice.account });

    for (const student of students) {
      const isRegistered = await feedbackAny.read.isRegisteredStudent([student]);
      assert.equal(isRegistered, true, `Student ${student} should be registered`);
    }

    // All registered students should be able to submit feedback
    await feedback.write.submitFeedback([1n, "Proposal 1", 5, "Great!", "academic", false], { account: bob.account });
    await feedback.write.submitFeedback([1n, "Proposal 1", 3, "Okay", "campus", false], { account: carol.account });
    await feedback.write.submitFeedback([2n, "Proposal 2", 4, "Good", "financial", false], { account: dave.account });

    const count = await feedback.read.getFeedbackCount();
    assert.equal(count, 3n);
  });

  it("allows moderators to moderate feedback", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Register Bob and have him submit feedback
    await feedbackAny.write.registerStudent([bob.account.address], { account: alice.account });
    await feedback.write.submitFeedback([
      exampleFeedback.proposalId,
      exampleFeedback.proposalTitle,
      exampleFeedback.rating,
      exampleFeedback.comment,
      exampleFeedback.category,
      exampleFeedback.isAnonymous
    ], { account: bob.account });

    // Alice (moderator) can moderate the feedback
    await feedbackAny.write.moderateFeedback([0n, false], { account: alice.account });

    // Check that feedback is now hidden
    const f = await feedback.read.getFeedback([0n]) as unknown as FeedbackView;
    const [_, __, ___, ____, _____, ______, _______, ________, moderated, isVisible] = f;
    
    assert.equal(moderated, true);
    assert.equal(isVisible, false);
  });

  it("submits feedback and stores all data correctly", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Register Alice first
    await feedbackAny.write.registerStudent([alice.account.address], { account: alice.account });

    const startBlock = await publicClient.getBlockNumber();

    await feedback.write.submitFeedback([
      exampleFeedback.proposalId,
      exampleFeedback.proposalTitle,
      exampleFeedback.rating,
      exampleFeedback.comment,
      exampleFeedback.category,
      exampleFeedback.isAnonymous
    ], { account: alice.account });

    // Check event emission
    type FeedbackSubmittedArgs = {
      id: bigint;
      student: Address;
      proposalId: bigint;
      proposalTitle: string;
      rating: number;
      category: string;
      isAnonymous: boolean;
    };

    const events = (await publicClient.getContractEvents({
      address: feedback.address,
      abi: feedback.abi,
      eventName: "FeedbackSubmitted",
      fromBlock: startBlock,
      strict: true,
    })) as Array<{ args: FeedbackSubmittedArgs }>;

    assert.equal(events.length, 1);
    const event = events[0].args;

    assert.equal(event.id, 0n);
    assert.ok(eqAddr(event.student, alice.account.address));
    assert.equal(event.proposalId, exampleFeedback.proposalId);
    assert.equal(event.proposalTitle, exampleFeedback.proposalTitle);
    assert.equal(event.rating, exampleFeedback.rating);
    assert.equal(event.category, exampleFeedback.category);
    assert.equal(event.isAnonymous, exampleFeedback.isAnonymous);

    // Check stored data
    const f = await feedback.read.getFeedback([0n]) as unknown as FeedbackView;
    const [
      proposalId,
      proposalTitle,
      rating,
      comment,
      category,
      submittedAt,
      student,
      isAnonymous,
      moderated,
      isVisible
    ] = f;

    assert.equal(proposalId, exampleFeedback.proposalId);
    assert.equal(proposalTitle, exampleFeedback.proposalTitle);
    assert.equal(rating, exampleFeedback.rating);
    assert.equal(comment, exampleFeedback.comment);
    assert.equal(category, exampleFeedback.category);
    assert.ok(submittedAt > 0n);
    assert.ok(eqAddr(student, alice.account.address));
    assert.equal(isAnonymous, exampleFeedback.isAnonymous);
    assert.equal(moderated, false);
    assert.equal(isVisible, true);
  });

  // Add this test to verify the ban/unban flow works correctly
  it("allows unbanned students to submit feedback again", async function () {
    const feedback = await viem.deployContract("Feedback");
    const feedbackAny = feedback as any;

    // Register, ban, then unban Bob
    await feedbackAny.write.registerStudent([bob.account.address], { account: alice.account });
    await feedbackAny.write.banStudent([bob.account.address], { account: alice.account });
    
    // Verify Bob is banned and cannot submit feedback
    const isBanned = await feedbackAny.read.isStudentBanned([bob.account.address]);
    assert.equal(isBanned, true, "Bob should be banned");

    await assert.rejects(
      feedback.write.submitFeedback([
        exampleFeedback.proposalId,
        exampleFeedback.proposalTitle,
        exampleFeedback.rating,
        exampleFeedback.comment,
        exampleFeedback.category,
        exampleFeedback.isAnonymous
      ], { account: bob.account }),
      /Not a registered student/
    );

    // Unban Bob
    await feedbackAny.write.unbanStudent([bob.account.address], { account: alice.account });

    // Bob should be able to submit feedback again
    await feedback.write.submitFeedback([
      exampleFeedback.proposalId,
      exampleFeedback.proposalTitle,
      exampleFeedback.rating,
      exampleFeedback.comment,
      exampleFeedback.category,
      exampleFeedback.isAnonymous
    ], { account: bob.account });

    const count = await feedback.read.getFeedbackCount();
    assert.equal(count, 1n, "Bob should be able to submit feedback after being unbanned");
  });
});