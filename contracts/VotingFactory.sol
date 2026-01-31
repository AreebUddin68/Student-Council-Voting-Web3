// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Election.sol";

/// @title Voting Factory for Student Council Elections - Gas Optimized
/// @notice Deploys and tracks Election contracts with gas optimizations
contract VotingFactory is Ownable {
    /* ─────────────── State Variables ─────────────── */
    
    uint256 public creationFee = 0.01 ether;
    address payable public treasury;

    struct ElectionRecord {
        address electionAddress;
        address organizer;
        string title;
        uint256 createdAt;
    }

    ElectionRecord[] private allElections;
    mapping(address => address[]) private electionsByOrganizer;

    /* ─────────────── Events ─────────────── */
    
    event ElectionCreated(
        address indexed election,
        address indexed organizer,
        string title
    );
    event CreationFeeUpdated(uint256 newFee);
    event TreasuryUpdated(address indexed newTreasury);
    event RefundIssued(address indexed recipient, uint256 amount);

    /* ─────────────── Errors (Gas Optimization) ─────────────── */
    
    error InvalidTreasury();
    error TitleRequired();
    error AtLeastOnePosition();
    error InsufficientFee();
    error FeeTransferFailed();
    error RefundFailed();

    /* ─────────────── Constructor ─────────────── */
    
    constructor(address payable _treasury) Ownable(msg.sender) {
        if (_treasury == address(0)) revert InvalidTreasury();
        treasury = _treasury;
    }

    /* ─────────────── Admin ─────────────── */
    
    function setCreationFee(uint256 newFee) external onlyOwner {
        creationFee = newFee;
        emit CreationFeeUpdated(newFee);
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /* ─────────────── Core ─────────────── */
    
    /// @notice Create a new election (organizer pays fee, voters vote free)
    /// @dev Gas optimized with custom errors and unchecked arithmetic
    function createElection(
        string calldata title,
        string[] calldata positions
    ) external payable returns (address electionAddress) {
        if (bytes(title).length == 0) revert TitleRequired();
        if (positions.length == 0) revert AtLeastOnePosition();
        if (msg.value < creationFee) revert InsufficientFee();

        // Deploy new Election contract
        Election election = new Election(
            msg.sender,
            title,
            positions
        );

        electionAddress = address(election);

        // Store election record
        allElections.push(
            ElectionRecord({
                electionAddress: electionAddress,
                organizer: msg.sender,
                title: title,
                createdAt: block.timestamp
            })
        );

        electionsByOrganizer[msg.sender].push(electionAddress);

        // Transfer creation fee to treasury
        (bool sent, ) = treasury.call{value: creationFee}("");
        if (!sent) revert FeeTransferFailed();

        // Refund excess ETH (Gas optimization: use unchecked)
        unchecked {
            uint256 refund = msg.value - creationFee;
            if (refund > 0) {
                (bool refunded, ) = payable(msg.sender).call{value: refund}("");
                if (!refunded) revert RefundFailed();
                emit RefundIssued(msg.sender, refund);
            }
        }

        emit ElectionCreated(electionAddress, msg.sender, title);
    }

    /* ─────────────── Views ─────────────── */
    
    function getAllElections() external view returns (ElectionRecord[] memory) {
        return allElections;
    }

    function getElectionsByOrganizer(address organizer)
        external
        view
        returns (address[] memory)
    {
        return electionsByOrganizer[organizer];
    }

    /// @notice Get total number of elections created (Gas Optimization)
    function getTotalElections() external view returns (uint256) {
        return allElections.length;
    }

    /// @notice Get paginated elections (Gas Optimization for large arrays)
    function getElectionsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (ElectionRecord[] memory)
    {
        uint256 total = allElections.length;
        if (offset >= total) {
            return new ElectionRecord[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - offset;
        ElectionRecord[] memory result = new ElectionRecord[](resultLength);

        for (uint256 i; i < resultLength; ) {
            result[i] = allElections[offset + i];
            unchecked { ++i; }
        }

        return result;
    }
}
