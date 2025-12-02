import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

type Address = `0x${string}`;
type ProposalView = readonly [
  string,   // title
  string,   // originalText
  string,   // creator
  string,   // authorizedBy
  bigint,   // decisionDate
  Address,  // proposer (on-chain)
  bigint,   // startAt
  bigint,   // endAt
  boolean,  // closed
  bigint,   // yes
  bigint    // no
];
type WinnerView = readonly [boolean, boolean];

// CORRECTED Role constants (32 bytes exactly)
const ROLES = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
  COUNCIL_ROLE: "0x8f4f2da22e8ac8f11e15f9fc141cddbb5deea8800186560abb6ee68cee3a5a4" as `0x${string}`, // keccak256("COUNCIL_ROLE")
  ADMIN_ROLE: "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775" as `0x${string}`, // keccak256("ADMIN_ROLE")
};

function eqAddr(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

describe("Ballot", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [alice, bob, carol, dave, eve] = await viem.getWalletClients();

  const example = {
    title: "Test Proposal",
    originalText: "This is a test proposal",
    creator: "Test Creator",
    authorizedBy: "Test Authority",
    decisionDate: BigInt(Math.floor(Date.now() / 1000)) + 86400n, // tomorrow
  } as const;

  async function deployBallot() {
    return await viem.deployContract("Ballot");
  }

  // FIXED: Use dynamic role reading instead of hardcoded
  it("deploys with correct initial roles", async function () {
    const ballot = await deployBallot();
    const ballotAny = ballot as any;

    // Try to read roles from contract first
    let COUNCIL_ROLE: `0x${string}`;
    let ADMIN_ROLE: `0x${string}`;
    
    try {
      COUNCIL_ROLE = await ballotAny.read.COUNCIL_ROLE();
      ADMIN_ROLE = await ballotAny.read.ADMIN_ROLE();
    } catch (e) {
      // Fallback to hardcoded if contract doesn't expose roles
      COUNCIL_ROLE = ROLES.COUNCIL_ROLE;
      ADMIN_ROLE = ROLES.ADMIN_ROLE;
    }

    const hasDefaultAdmin = await ballotAny.read.hasRole([ROLES.DEFAULT_ADMIN_ROLE, alice.account.address]);
    const hasAdminRole = await ballotAny.read.hasRole([ADMIN_ROLE, alice.account.address]);
    const hasCouncilRole = await ballotAny.read.hasRole([COUNCIL_ROLE, alice.account.address]);

    console.log("Default Admin Role:", hasDefaultAdmin);
    console.log("Admin Role:", hasAdminRole); 
    console.log("Council Role:", hasCouncilRole);

    assert.equal(hasDefaultAdmin, true, "Deployer should have DEFAULT_ADMIN_ROLE");
    assert.equal(hasAdminRole, true, "Deployer should have ADMIN_ROLE");
    assert.equal(hasCouncilRole, true, "Deployer should have COUNCIL_ROLE");
  });

  it("allows council members to create proposals", async function () {
    const ballot = await deployBallot();
    const ballotAny = ballot as any;

    // Grant council role to Bob
    await ballotAny.write.grantCouncilRole([bob.account.address], { account: alice.account });

    // Bob should be able to create proposal
    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        60n,
      ],
      { account: bob.account }
    );

    const p = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    const [title, , , , , proposer] = p;

    assert.equal(title, example.title);
    assert.ok(eqAddr(proposer, bob.account.address));
  });

  it("prevents non-admin from granting council roles", async function () {
    const ballot = await viem.deployContract("Ballot");
    const ballotAny = ballot as any;

    // Bob (no roles) tries to grant council role - should fail
    await assert.rejects(
      ballotAny.write.grantCouncilRole([eve.account.address], { account: bob.account }),
      /AccessControlUnauthorizedAccount/
    );
  });

  it("allows anyone to vote regardless of role", async function () {
    const ballot = await viem.deployContract("Ballot");

    // Alice creates proposal
    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n, // open-ended
      ]
    );

    // Bob (no role) can vote
    await ballot.write.vote([0n, true], { account: bob.account });
    // Carol (no role) can vote
    await ballot.write.vote([0n, false], { account: carol.account });

    const [, , , , , , , , , yes, no] = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    assert.equal(yes, 1n);
    assert.equal(no, 1n);

    const bobVoted = await ballot.read.hasVoted([0n, bob.account.address]);
    const carolVoted = await ballot.read.hasVoted([0n, carol.account.address]);
    assert.equal(bobVoted, true);
    assert.equal(carolVoted, true);
  });

  it("allows council members to close proposals", async function () {
    const ballot = await viem.deployContract("Ballot");
    const ballotAny = ballot as any;

    // Grant council role to Bob
    await ballotAny.write.grantCouncilRole([bob.account.address], { account: alice.account });

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n, // open-ended
      ]
    );

    // Bob should be able to close
    await ballot.write.close([0n], { account: bob.account });

    const [, , , , , , , , isClosed] = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    assert.equal(isClosed, true);
  });

  it("prevents non-council members from closing proposals", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n, // open-ended
      ]
    );

    // Carol (no role) tries to close - should fail
    await assert.rejects(
      ballot.write.close([0n], { account: carol.account }),
      /OnlyCouncilOrAdmin/
    );
  });

  // ===== ORIGINAL FUNCTIONALITY TESTS =====
  it("creates a proposal and stores metadata", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        60n,
      ]
    );

    const p = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    const [
      title,
      originalText,
      creator,
      authorizedBy,
      decisionDate,
      proposer,
      startAt,
      endAt,
      closed,
      yes,
      no,
    ] = p;

    assert.equal(title, example.title);
    assert.equal(originalText, example.originalText);
    assert.equal(creator, example.creator);
    assert.equal(authorizedBy, example.authorizedBy);
    assert.equal(decisionDate, example.decisionDate);

    assert.ok(eqAddr(proposer, alice.account.address));
    assert.equal(closed, false);
    assert.equal(yes, 0n);
    assert.equal(no, 0n);
    assert.ok(endAt > startAt);
  });

  it("emits Voted and tallies yes/no; hasVoted reflects state", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n, // open-ended
      ]
    );

    const startBlock = await publicClient.getBlockNumber();

    // Bob YES, Carol NO
    await ballot.write.vote([0n, true], { account: bob.account });
    await ballot.write.vote([0n, false], { account: carol.account });

    type VotedArgs = {
      id: bigint;
      voter: Address;
      supportYes: boolean;
      yes: bigint;
      no: bigint;
    };
    const events = (await publicClient.getContractEvents({
      address: ballot.address,
      abi: ballot.abi,
      eventName: "Voted",
      fromBlock: startBlock,
      strict: true,
    })) as Array<{ args: VotedArgs }>;

    assert.equal(events.length, 2);

    const byVoter = (addr: string) => events.find((e) => eqAddr(e.args.voter, addr))!;

    const bobEv = byVoter(bob.account.address);
    const carolEv = byVoter(carol.account.address);

    assert.equal(bobEv.args.id, 0n);
    assert.ok(eqAddr(bobEv.args.voter, bob.account.address));
    assert.equal(bobEv.args.supportYes, true);
    assert.equal(bobEv.args.yes, 1n);
    assert.equal(bobEv.args.no, 0n);

    assert.equal(carolEv.args.id, 0n);
    assert.ok(eqAddr(carolEv.args.voter, carol.account.address));
    assert.equal(carolEv.args.supportYes, false);
    assert.equal(carolEv.args.yes, 1n);
    assert.equal(carolEv.args.no, 1n);

    // tallies + hasVoted
    const [, , , , , , , , , yes, no] = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    assert.equal(yes, 1n);
    assert.equal(no, 1n);

    const bobVoted = await ballot.read.hasVoted([0n, bob.account.address]);
    const carolVoted = await ballot.read.hasVoted([0n, carol.account.address]);
    assert.equal(bobVoted, true);
    assert.equal(carolVoted, true);
  });

  it("prevents double voting (AlreadyVoted)", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n,
      ]
    );

    await ballot.write.vote([0n, true], { account: bob.account });

    await assert.rejects(
      ballot.write.vote([0n, true], { account: bob.account }),
      /AlreadyVoted/
    );
  });

  it("enforces deadline: voting closes after endAt (VotingClosed)", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        10n,
      ]
    );
    await ballot.write.vote([0n, true], { account: bob.account });

    await publicClient.transport.request({ method: "evm_increaseTime", params: [11] });
    await publicClient.transport.request({ method: "evm_mine", params: [] });

    await assert.rejects(
      ballot.write.vote([0n, false], { account: bob.account }),
      /VotingClosed/
    );
  });

  it("cannot close before deadline (NotClosableYet); can close after", async function () {
    const ballot = await viem.deployContract("Ballot");
    const fromBlock = await publicClient.getBlockNumber();

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        10n,
      ]
    );

    await assert.rejects(ballot.write.close([0n]), /NotClosableYet/);

    await publicClient.transport.request({ method: "evm_increaseTime", params: [11] });
    await publicClient.transport.request({ method: "evm_mine", params: [] });

    await ballot.write.close([0n]);

    const closedEvents = await publicClient.getContractEvents({
      address: ballot.address,
      abi: ballot.abi,
      eventName: "ProposalClosed",
      fromBlock,
      strict: true,
    });
    assert.equal(closedEvents.length, 1);

    const [, , , , , , , , isClosed] = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    assert.equal(isClosed, true);
  });

  it("can be manually closed if open-ended (endAt = 0)", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n,
      ]
    );
    await ballot.write.close([0n]);

    const [, , , , , , , , isClosed] = await ballot.read.getProposal([0n]) as unknown as ProposalView;
    assert.equal(isClosed, true);
  });

  it("currentWinner reports yes/no or no-winner on tie", async function () {
    const ballot = await viem.deployContract("Ballot");

    await ballot.write.createProposal(
      [
        example.title,
        example.originalText,
        example.creator,
        example.authorizedBy,
        example.decisionDate,
        0n,
      ]
    );

    let [winnerIsYes, exists] = await ballot.read.currentWinner([0n]) as unknown as WinnerView;
    assert.equal(exists, false);

    await ballot.write.vote([0n, true], { account: bob.account });
    [winnerIsYes, exists] = await ballot.read.currentWinner([0n]) as unknown as WinnerView;
    assert.equal(exists, true);
    assert.equal(winnerIsYes, true);

    await ballot.write.vote([0n, false], { account: carol.account });
    [winnerIsYes, exists] = await ballot.read.currentWinner([0n]) as unknown as WinnerView;
    assert.equal(exists, false);
  });
});