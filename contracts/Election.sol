// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Student Council Election - Gas Optimized
/// @notice Whitelist-based, multi-position voting contract with gas optimizations
contract Election is Ownable, ReentrancyGuard {
    /* ─────────────── Enums & State Variables ─────────────── */
    
    enum Status {
        Draft,
        Active,
        Ended
    }
    
    Status public electionStatus;
    bool public paused;
    string public electionTitle;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public totalWhitelistedVoters;
    uint256 public totalVotesCast;

    /* ─────────────── Structs ─────────────── */
    
    struct Candidate {
        string name;
        address wallet;
        uint256 votes;
    }

    struct Position {
        string title;
        Candidate[] candidates;
        mapping(address => bool) candidateExists;
    }

    Position[] private positions;
    
    // Gas Optimization: Pack booleans together
    mapping(address => bool) public whitelisted;
    mapping(address => bool) public hasVoted;
    mapping(address => uint256[]) private voterBallots;

    /* ─────────────── Events ─────────────── */
    
    event CandidateAdded(uint256 indexed positionIndex, string name, address wallet);
    event VoterWhitelisted(address indexed voter);
    event VotersWhitelisted(uint256 count); // Gas optimization: batch event
    event ElectionStarted(uint256 startTime, uint256 endTime);
    event VoteCast(address indexed voter);
    event ElectionEnded(uint256 timestamp);
    event WinnerDeclared(
        uint256 indexed positionIndex,
        uint256 indexed candidateIndex,
        address wallet,
        string name,
        uint256 votes
    );
    event Paused();
    event Resumed();

    /* ─────────────── Errors (Gas Optimization) ─────────────── */
    
    error ElectionPaused();
    error InvalidOrganizer();
    error TitleRequired();
    error NoPositions();
    error EmptyPosition();
    error NotDraft();
    error InvalidPositionIndex();
    error InvalidWallet();
    error NameRequired();
    error CandidateAlreadyAdded();
    error AlreadyStarted();
    error InvalidDuration();
    error MissingCandidates();
    error NotActive();
    error ElectionAlreadyEnded();
    error NotWhitelisted();
    error AlreadyVoted();
    error InvalidBallot();
    error InvalidCandidateIndex();
    error TooEarly();
    error InvalidIndex();
    error Unauthorized();

    /* ─────────────── Modifiers ─────────────── */
    
    modifier notPaused() {
        if (paused) revert ElectionPaused();
        _;
    }

    /* ─────────────── Constructor ─────────────── */
    
    constructor(
        address organizer,
        string memory title,
        string[] memory positionNames
    ) Ownable(organizer) {
        if (organizer == address(0)) revert InvalidOrganizer();
        if (bytes(title).length == 0) revert TitleRequired();
        if (positionNames.length == 0) revert NoPositions();

        electionTitle = title;
        electionStatus = Status.Draft;

        uint256 length = positionNames.length;
        for (uint256 i; i < length; ) {
            if (bytes(positionNames[i]).length == 0) revert EmptyPosition();
            positions.push();
            positions[i].title = positionNames[i];
            unchecked { ++i; } // Gas optimization: unchecked increment
        }
    }

    /* ─────────────── Setup (Draft) ─────────────── */
    
    function addCandidate(
        uint256 positionIndex,
        string calldata name,
        address wallet
    ) external onlyOwner {
        if (electionStatus != Status.Draft) revert NotDraft();
        if (positionIndex >= positions.length) revert InvalidPositionIndex();
        if (wallet == address(0)) revert InvalidWallet();
        if (bytes(name).length == 0) revert NameRequired();
        if (positions[positionIndex].candidateExists[wallet]) revert CandidateAlreadyAdded();

        positions[positionIndex].candidates.push(
            Candidate(name, wallet, 0)
        );
        positions[positionIndex].candidateExists[wallet] = true;

        emit CandidateAdded(positionIndex, name, wallet);
    }

    /// @notice Whitelist voters in batch (Gas Optimized)
    function whitelistVoters(address[] calldata voters) external onlyOwner {
        if (electionStatus != Status.Draft) revert NotDraft();
        
        uint256 length = voters.length;
        uint256 count;
        
        for (uint256 i; i < length; ) {
            address v = voters[i];
            if (v != address(0) && !whitelisted[v]) {
                whitelisted[v] = true;
                unchecked { 
                    ++totalWhitelistedVoters;
                    ++count;
                }
                emit VoterWhitelisted(v);
            }
            unchecked { ++i; }
        }
        
        emit VotersWhitelisted(count);
    }

    function startElection(uint256 durationSeconds) external onlyOwner {
        if (electionStatus != Status.Draft) revert AlreadyStarted();
        if (durationSeconds == 0) revert InvalidDuration();

        uint256 length = positions.length;
        for (uint256 i; i < length; ) {
            if (positions[i].candidates.length == 0) revert MissingCandidates();
            unchecked { ++i; }
        }

        electionStatus = Status.Active;
        startTime = block.timestamp;
        endTime = block.timestamp + durationSeconds;

        emit ElectionStarted(startTime, endTime);
    }

    /* ─────────────── Voting ─────────────── */
    
    function vote(uint256[] calldata candidateIndexes)
        external
        nonReentrant
        notPaused
    {
        if (electionStatus != Status.Active) revert NotActive();
        if (block.timestamp > endTime) revert ElectionAlreadyEnded();
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        if (candidateIndexes.length != positions.length) revert InvalidBallot();

        uint256 length = candidateIndexes.length;
        for (uint256 i; i < length; ) {
            uint256 idx = candidateIndexes[i];
            if (idx >= positions[i].candidates.length) revert InvalidCandidateIndex();
            
            unchecked {
                ++positions[i].candidates[idx].votes;
                ++i;
            }
        }

        hasVoted[msg.sender] = true;
        voterBallots[msg.sender] = candidateIndexes;
        
        unchecked { ++totalVotesCast; }

        emit VoteCast(msg.sender);
    }

    /* ─────────────── Finalization ─────────────── */
    
    function finalizeElection() external onlyOwner nonReentrant {
        if (electionStatus != Status.Active) revert NotActive();
        if (block.timestamp < endTime) revert TooEarly();

        uint256 posLength = positions.length;
        for (uint256 i; i < posLength; ) {
            Position storage p = positions[i];
            uint256 maxVotes;
            uint256 candLength = p.candidates.length;
            
            // Find max votes
            for (uint256 j; j < candLength; ) {
                if (p.candidates[j].votes > maxVotes) {
                    maxVotes = p.candidates[j].votes;
                }
                unchecked { ++j; }
            }

            // Emit winners
            for (uint256 j; j < candLength; ) {
                if (p.candidates[j].votes == maxVotes) {
                    emit WinnerDeclared(
                        i,
                        j,
                        p.candidates[j].wallet,
                        p.candidates[j].name,
                        p.candidates[j].votes
                    );
                }
                unchecked { ++j; }
            }
            
            unchecked { ++i; }
        }

        electionStatus = Status.Ended;
        emit ElectionEnded(block.timestamp);
    }

    /* ─────────────── Emergency ─────────────── */
    
    function pause() external onlyOwner {
        if (electionStatus != Status.Active) revert NotActive();
        paused = true;
        emit Paused();
    }

    function resume() external onlyOwner {
        if (electionStatus != Status.Active) revert NotActive();
        paused = false;
        emit Resumed();
    }

    /* ─────────────── Views ─────────────── */
    
    function getPositionsCount() external view returns (uint256) {
        return positions.length;
    }

    function getPosition(uint256 index)
        external
        view
        returns (string memory title, uint256 candidateCount)
    {
        if (index >= positions.length) revert InvalidIndex();
        Position storage p = positions[index];
        return (p.title, p.candidates.length);
    }

    function getCandidate(
        uint256 posIndex,
        uint256 candIndex
    )
        external
        view
        returns (string memory name, address wallet, uint256 votes)
    {
        if (posIndex >= positions.length) revert InvalidPositionIndex();
        Position storage p = positions[posIndex];
        if (candIndex >= p.candidates.length) revert InvalidCandidateIndex();
        
        Candidate storage c = p.candidates[candIndex];
        return (c.name, c.wallet, c.votes);
    }

    function getVoterBallot(address voter)
        external
        view
        returns (uint256[] memory)
    {
        if (msg.sender != voter && msg.sender != owner()) revert Unauthorized();
        return voterBallots[voter];
    }

    /// @notice Get election stats in one call (Gas Optimization)
    function getElectionStats()
        external
        view
        returns (
            uint256 _totalVoters,
            uint256 _votesCast,
            uint256 _startTime,
            uint256 _endTime
        )
    {
        return (
            totalWhitelistedVoters,
            totalVotesCast,
            startTime,
            endTime
        );
    }
}
