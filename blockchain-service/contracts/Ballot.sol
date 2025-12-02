// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Ballot (Yes/No) voting for proposals with rich metadata
contract Ballot is AccessControl {
    bytes32 public constant COUNCIL_ROLE = keccak256("COUNCIL_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct Proposal {
        string title;
        string originalText;
        string creator;
        string authorizedBy;
        uint64 decisionDate;
        address proposer;
        uint64 startAt;
        uint64 endAt;
        uint256 yes;
        uint256 no;
        bool closed;
        mapping(address => bool) voted;
    }

    struct CreateParams {
        string title;
        string originalText;
        string creator;
        string authorizedBy;
        uint64 decisionDate;
        uint64 durationSeconds;
    }

    Proposal[] private _proposals;

    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        string title,
        uint64 decisionDate,
        string creator,
        string authorizedBy,
        uint64 startAt,
        uint64 endAt
    );
    event Voted(uint256 indexed id, address indexed voter, bool supportYes, uint256 yes, uint256 no);
    event ProposalClosed(uint256 indexed id, uint256 yes, uint256 no);

    error InvalidDuration();
    error VotingClosed();
    error AlreadyVoted();
    error NotClosableYet();
    error OnlyCouncilOrAdmin();

    modifier onlyCouncilOrAdmin() {
        if (!hasRole(COUNCIL_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert OnlyCouncilOrAdmin();
        }
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(COUNCIL_ROLE, msg.sender);
    }

    // External entry with many params -> immediately bundle & delegate to internal
    function createProposal(
        string calldata title,
        string calldata originalText,
        string calldata creator,
        string calldata authorizedBy,
        uint64 decisionDate,
        uint64 durationSeconds
    ) external onlyCouncilOrAdmin returns (uint256 id) {
        CreateParams memory cp = CreateParams({
            title: title,
            originalText: originalText,
            creator: creator,
            authorizedBy: authorizedBy,
            decisionDate: decisionDate,
            durationSeconds: durationSeconds
        });
        return _create(cp);
    }

    // Internal does the work with one param on stack
    function _create(CreateParams memory a) internal returns (uint256 id) {
        uint64 start = uint64(block.timestamp);
        uint64 end = a.durationSeconds == 0 ? 0 : start + a.durationSeconds;
        if (a.durationSeconds > 0 && end <= start) revert InvalidDuration();

        id = _proposals.length;
        Proposal storage p = _proposals.push();
        p.title = a.title;
        p.originalText = a.originalText;
        p.creator = a.creator;
        p.authorizedBy = a.authorizedBy;
        p.decisionDate = a.decisionDate;
        p.proposer = msg.sender;
        p.startAt = start;
        p.endAt = end;

        emit ProposalCreated(id, msg.sender, a.title, a.decisionDate, a.creator, a.authorizedBy, start, end);
    }

    function vote(uint256 id, bool supportYes) external {
        Proposal storage p = _proposals[id];
        if (_isClosed(p)) revert VotingClosed();
        if (p.voted[msg.sender]) revert AlreadyVoted();

        p.voted[msg.sender] = true;
        if (supportYes) {
            unchecked { p.yes += 1; }
        } else {
            unchecked { p.no += 1; }
        }
        emit Voted(id, msg.sender, supportYes, p.yes, p.no);
    }

    function close(uint256 id) external onlyCouncilOrAdmin {
        Proposal storage p = _proposals[id];
        if (p.closed) return;
        if (p.endAt != 0 && block.timestamp < p.endAt) revert NotClosableYet();
        p.closed = true;
        emit ProposalClosed(id, p.yes, p.no);
    }

    // Admin functions for role management
    function grantCouncilRole(address account) external onlyRole(ADMIN_ROLE) {
        grantRole(COUNCIL_ROLE, account);
    }

    function revokeCouncilRole(address account) external onlyRole(ADMIN_ROLE) {
        revokeRole(COUNCIL_ROLE, account);
    }

    function grantAdminRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(ADMIN_ROLE, account);
    }

    // View functions remain the same
    function getProposal(uint256 id)
        external
        view
        returns (
            string memory title,
            string memory originalText,
            string memory creator,
            string memory authorizedBy,
            uint64 decisionDate,
            address proposer,
            uint64 startAt,
            uint64 endAt,
            bool closed,
            uint256 yes,
            uint256 no
        )
    {
        Proposal storage p = _proposals[id];
        return (
            p.title,
            p.originalText,
            p.creator,
            p.authorizedBy,
            p.decisionDate,
            p.proposer,
            p.startAt,
            p.endAt,
            p.closed,
            p.yes,
            p.no
        );
    }

    function hasVoted(uint256 id, address account) external view returns (bool) {
        return _proposals[id].voted[account];
    }

    function proposalsCount() external view returns (uint256) {
        return _proposals.length;
    }

    function currentWinner(uint256 id) external view returns (bool winnerIsYes, bool exists) {
        Proposal storage p = _proposals[id];
        if (p.yes == p.no) return (false, false);
        return (p.yes > p.no, true);
    }

    function _isClosed(Proposal storage p) internal view returns (bool) {
        if (p.closed) return true;
        if (p.endAt == 0) return false;
        return block.timestamp >= p.endAt;
    }
}