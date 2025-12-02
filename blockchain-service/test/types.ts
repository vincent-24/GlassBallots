// test/types.ts
export type Address = `0x${string}`;

// Base contract types
export type BaseContract = {
  address: Address;
  abi: any[];
  read: any;
  write: any;
};

// Ballot contract specific type
export type BallotContract = BaseContract & {
  read: {
    getProposal: (args: [bigint]) => Promise<readonly [string, string, string, string, bigint, Address, bigint, bigint, boolean, bigint, bigint]>;
    hasVoted: (args: [bigint, Address]) => Promise<boolean>;
    proposalsCount: () => Promise<bigint>;
    currentWinner: (args: [bigint]) => Promise<readonly [boolean, boolean]>;
    // OpenZeppelin functions
    hasRole: (args: [`0x${string}`, Address]) => Promise<boolean>;
    DEFAULT_ADMIN_ROLE: () => Promise<`0x${string}`>;
    COUNCIL_ROLE: () => Promise<`0x${string}`>;
    ADMIN_ROLE: () => Promise<`0x${string}`>;
  };
  write: {
    createProposal: (args: [string, string, string, string, bigint, bigint], options?: any) => Promise<any>;
    vote: (args: [bigint, boolean], options?: any) => Promise<any>;
    close: (args: [bigint], options?: any) => Promise<any>;
    // OpenZeppelin functions
    grantCouncilRole: (args: [Address], options?: any) => Promise<any>;
    grantAdminRole: (args: [Address], options?: any) => Promise<any>;
  };
};

// Feedback contract specific type
export type FeedbackContract = BaseContract & {
  read: {
    getFeedback: (args: [bigint]) => Promise<readonly [bigint, string, number, string, string, bigint, Address, boolean, boolean, boolean]>;
    getFeedbackCount: () => Promise<bigint>;
    getVisibleFeedbackCount: () => Promise<bigint>;
    getFeedbacksByProposal: (args: [bigint]) => Promise<bigint[]>;
    getFeedbacksByCategory: (args: [string]) => Promise<bigint[]>;
    getAverageRating: (args: [bigint]) => Promise<readonly [bigint, bigint]>;
    isStudentBanned: (args: [Address]) => Promise<boolean>;
    isRegisteredStudent: (args: [Address]) => Promise<boolean>;
    // OpenZeppelin functions
    hasRole: (args: [`0x${string}`, Address]) => Promise<boolean>;
    DEFAULT_ADMIN_ROLE: () => Promise<`0x${string}`>;
    STUDENT_ROLE: () => Promise<`0x${string}`>;
    MODERATOR_ROLE: () => Promise<`0x${string}`>;
  };
  write: {
    submitFeedback: (args: [bigint, string, number, string, string, boolean], options?: any) => Promise<any>;
    registerStudent: (args: [Address], options?: any) => Promise<any>;
    bulkRegisterStudents: (args: [Address[]], options?: any) => Promise<any>;
    moderateFeedback: (args: [bigint, boolean], options?: any) => Promise<any>;
    banStudent: (args: [Address], options?: any) => Promise<any>;
    unbanStudent: (args: [Address], options?: any) => Promise<any>;
    grantModeratorRole: (args: [Address], options?: any) => Promise<any>;
  };
};

// Role constants (precomputed keccak256 hashes)
export const ROLES = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
  COUNCIL_ROLE: "0x434f554e43494c5f524f4c450000000000000000000000000000000000000000" as `0x${string}`,
  ADMIN_ROLE: "0x41444d494e5f524f4c4500000000000000000000000000000000000000000000" as `0x${string}`,
  STUDENT_ROLE: "0x53545544454e545f524f4c450000000000000000000000000000000000000000" as `0x${string}`,
  MODERATOR_ROLE: "0x4d4f44455241544f525f524f4c4500000000000000000000000000000000000000" as `0x${string}`,
};