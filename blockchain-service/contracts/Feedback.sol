// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Civic Legislation Feedback System for collecting student feedback on proposals
contract Feedback is AccessControl {
    bytes32 public constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    struct FeedbackItem {
        uint256 proposalId;    // Reference to the ballot proposal
        string proposalTitle;  // Title of the legislation
        uint8 rating;          // 1-5 rating of the proposal
        string comment;        // Detailed feedback
        string category;       // Category: "academic", "campus", "financial", "other"
        uint64 submittedAt;
        address student;
        bool isAnonymous;
        bool moderated;
        bool isVisible;
    }

    struct CreateParams {
        uint256 proposalId;
        string proposalTitle;
        uint8 rating;
        string comment;
        string category;
        bool isAnonymous;
    }

    FeedbackItem[] private _feedbacks;
    mapping(address => bool) private _bannedStudents;

    event FeedbackSubmitted(
        uint256 indexed id,
        address indexed student,
        uint256 proposalId,
        string proposalTitle,
        uint8 rating,
        string category,
        bool isAnonymous
    );
    event FeedbackModerated(uint256 indexed id, bool isVisible);
    event StudentBanned(address indexed student);
    event StudentUnbanned(address indexed student);

    error InvalidRating();
    error EmptyProposalTitle();
    error InvalidCategory();
    error StudentBannedError();
    error OnlyModerator();

    modifier onlyStudent() {
        if (!hasRole(STUDENT_ROLE, msg.sender)) {
            revert("Not a registered student");
        }
        _;
    }

    modifier onlyModerator() {
        if (!hasRole(MODERATOR_ROLE, msg.sender)) {
            revert OnlyModerator();
        }
        _;
    }

    modifier notBanned() {
        if (_bannedStudents[msg.sender]) {
            revert StudentBannedError();
        }
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);
    }

    // Register a student - only admins/moderators can do this
    function registerStudent(address student) external onlyRole(MODERATOR_ROLE) {
        grantRole(STUDENT_ROLE, student);
        _bannedStudents[student] = false; // Ensure they're not banned when registered
    }

    // Bulk register students
    function bulkRegisterStudents(address[] calldata students) external onlyRole(MODERATOR_ROLE) {
        for (uint i = 0; i < students.length; i++) {
            grantRole(STUDENT_ROLE, students[i]);
            _bannedStudents[students[i]] = false;
        }
    }

    // External entry with many params -> immediately bundle & delegate to internal
    function submitFeedback(
        uint256 proposalId,
        string calldata proposalTitle,
        uint8 rating,
        string calldata comment,
        string calldata category,
        bool isAnonymous
    ) external onlyStudent notBanned returns (uint256 id) {
        CreateParams memory cp = CreateParams({
            proposalId: proposalId,
            proposalTitle: proposalTitle,
            rating: rating,
            comment: comment,
            category: category,
            isAnonymous: isAnonymous
        });
        return _create(cp);
    }

    // Internal does the work with one param on stack
    function _create(CreateParams memory a) internal returns (uint256 id) {
        if (bytes(a.proposalTitle).length == 0) revert EmptyProposalTitle();
        if (a.rating < 1 || a.rating > 5) revert InvalidRating();
        
        // Validate category
        bytes32 categoryHash = keccak256(bytes(a.category));
        if (categoryHash != keccak256(bytes("academic")) &&
            categoryHash != keccak256(bytes("campus")) &&
            categoryHash != keccak256(bytes("financial")) &&
            categoryHash != keccak256(bytes("other"))) {
            revert InvalidCategory();
        }

        id = _feedbacks.length;
        uint64 submittedAt = uint64(block.timestamp);

        FeedbackItem memory newFeedback = FeedbackItem({
            proposalId: a.proposalId,
            proposalTitle: a.proposalTitle,
            rating: a.rating,
            comment: a.comment,
            category: a.category,
            submittedAt: submittedAt,
            student: a.isAnonymous ? address(0) : msg.sender,
            isAnonymous: a.isAnonymous,
            moderated: false,
            isVisible: true // Auto-approve by default, moderators can hide
        });

        _feedbacks.push(newFeedback);

        emit FeedbackSubmitted(id, newFeedback.student, a.proposalId, a.proposalTitle, a.rating, a.category, a.isAnonymous);
    }

    // Moderation functions
    function moderateFeedback(uint256 id, bool isVisible) external onlyModerator {
        require(id < _feedbacks.length, "Invalid feedback ID");
        
        _feedbacks[id].moderated = true;
        _feedbacks[id].isVisible = isVisible;
        
        emit FeedbackModerated(id, isVisible);
    }

    function banStudent(address student) external onlyModerator {
        _bannedStudents[student] = true;
        revokeRole(STUDENT_ROLE, student);
        emit StudentBanned(student);
    }

    function unbanStudent(address student) external onlyModerator {
        _bannedStudents[student] = false;
        grantRole(STUDENT_ROLE, student);
        emit StudentUnbanned(student);
    }

    // Role management functions
    function grantModeratorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(MODERATOR_ROLE, account);
    }

    function revokeModeratorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(MODERATOR_ROLE, account);
    }

    // View functions with permission checks
    function getFeedback(uint256 id)
        external
        view
        returns (
            uint256 proposalId,
            string memory proposalTitle,
            uint8 rating,
            string memory comment,
            string memory category,
            uint64 submittedAt,
            address student,
            bool isAnonymous,
            bool moderated,
            bool isVisible
        )
    {
        FeedbackItem storage f = _feedbacks[id];
        
        // Hide details if not visible and caller is not moderator
        if (!f.isVisible && !hasRole(MODERATOR_ROLE, msg.sender)) {
            return (f.proposalId, f.proposalTitle, 0, "Hidden feedback", f.category, f.submittedAt, address(0), true, true, false);
        }
        
        return (
            f.proposalId,
            f.proposalTitle,
            f.rating,
            f.comment,
            f.category,
            f.submittedAt,
            f.student,
            f.isAnonymous,
            f.moderated,
            f.isVisible
        );
    }

    function getFeedbackCount() external view returns (uint256) {
        return _feedbacks.length;
    }

    function getVisibleFeedbackCount() external view returns (uint256) {
        if (hasRole(MODERATOR_ROLE, msg.sender)) {
            return _feedbacks.length;
        }
        
        uint256 count = 0;
        for (uint256 i = 0; i < _feedbacks.length; i++) {
            if (_feedbacks[i].isVisible) {
                count++;
            }
        }
        return count;
    }

    function getFeedbacksByProposal(uint256 proposalId) external view returns (uint256[] memory) {
        uint256 count = 0;
        
        // First count matching feedbacks
        for (uint256 i = 0; i < _feedbacks.length; i++) {
            if (_feedbacks[i].proposalId == proposalId && 
                (_feedbacks[i].isVisible || hasRole(MODERATOR_ROLE, msg.sender))) {
                count++;
            }
        }

        // Then populate array
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _feedbacks.length; i++) {
            if (_feedbacks[i].proposalId == proposalId && 
                (_feedbacks[i].isVisible || hasRole(MODERATOR_ROLE, msg.sender))) {
                result[index] = i;
                index++;
            }
        }
        return result;
    }

    function getFeedbacksByCategory(string calldata category) external view returns (uint256[] memory) {
        uint256 count = 0;
        
        // First count matching feedbacks
        for (uint256 i = 0; i < _feedbacks.length; i++) {
            if (keccak256(bytes(_feedbacks[i].category)) == keccak256(bytes(category)) && 
                (_feedbacks[i].isVisible || hasRole(MODERATOR_ROLE, msg.sender))) {
                count++;
            }
        }

        // Then populate array
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _feedbacks.length; i++) {
            if (keccak256(bytes(_feedbacks[i].category)) == keccak256(bytes(category)) && 
                (_feedbacks[i].isVisible || hasRole(MODERATOR_ROLE, msg.sender))) {
                result[index] = i;
                index++;
            }
        }
        return result;
    }

    function getAverageRating(uint256 proposalId) external view returns (uint256 average, uint256 count) {
        uint256 total = 0;
        count = 0;
        
        for (uint256 i = 0; i < _feedbacks.length; i++) {
            if (_feedbacks[i].proposalId == proposalId && _feedbacks[i].isVisible) {
                total += _feedbacks[i].rating;
                count++;
            }
        }
        
        if (count > 0) {
            average = total / count;
        }
        return (average, count);
    }

    function isStudentBanned(address student) external view returns (bool) {
        return _bannedStudents[student];
    }

    function isRegisteredStudent(address student) external view returns (bool) {
        return hasRole(STUDENT_ROLE, student) && !_bannedStudents[student];
    }
}