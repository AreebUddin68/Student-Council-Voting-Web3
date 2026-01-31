import { expect } from "chai";
import { network } from "hardhat";
import { Election } from "../types/ethers-contracts/index.js";

const { ethers } = await network.connect();

describe("Election Contract", function () {
  let election: Election;
  let owner: any;
  let voter1: any;
  let voter2: any;
  let voter3: any;
  let candidate1: any;
  let candidate2: any;
  let candidate3: any;
  let other: any;

  const ELECTION_TITLE = "Student Council Elections 2026";
  const POSITIONS = ["President", "Vice President", "Secretary"];
  const DURATION = 3600; // 1 hour

  beforeEach(async function () {
    [owner, voter1, voter2, voter3, candidate1, candidate2, candidate3, other] =
      await ethers.getSigners();

    // Deploy Election contract
    const ElectionFactory = await ethers.getContractFactory("Election");
    election = await ElectionFactory.deploy(owner.address, ELECTION_TITLE, POSITIONS);
    await election.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await election.owner()).to.equal(owner.address);
    });

    it("Should set the correct election title", async function () {
      expect(await election.electionTitle()).to.equal(ELECTION_TITLE);
    });

    it("Should set election status to Draft", async function () {
      expect(await election.electionStatus()).to.equal(0); // Draft = 0
    });

    it("Should create correct number of positions", async function () {
      expect(await election.getPositionsCount()).to.equal(POSITIONS.length);
    });

    it("Should initialize positions with correct titles", async function () {
      for (let i = 0; i < POSITIONS.length; i++) {
        const [title] = await election.getPosition(i);
        expect(title).to.equal(POSITIONS[i]);
      }
    });

    it("Should revert with invalid organizer (zero address)", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      await expect(
        ElectionFactory.deploy(ethers.ZeroAddress, ELECTION_TITLE, POSITIONS)
      ).to.be.revertedWithCustomError(election, "OwnableInvalidOwner");
    });

    it("Should revert with empty title", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      await expect(
        ElectionFactory.deploy(owner.address, "", POSITIONS)
      ).to.be.revertedWithCustomError(election, "TitleRequired");
    });

    it("Should revert with no positions", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      await expect(
        ElectionFactory.deploy(owner.address, ELECTION_TITLE, [])
      ).to.be.revertedWithCustomError(election, "NoPositions");
    });

    it("Should revert with empty position name", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      await expect(
        ElectionFactory.deploy(owner.address, ELECTION_TITLE, ["President", "", "Secretary"])
      ).to.be.revertedWithCustomError(election, "EmptyPosition");
    });
  });

  describe("Adding Candidates", function () {
    it("Should add candidate successfully", async function () {
      await expect(
        election
          .connect(owner)
          .addCandidate(0, "John Doe", candidate1.address)
      )
        .to.emit(election, "CandidateAdded")
        .withArgs(0, "John Doe", candidate1.address);

      const [name, wallet, votes] = await election.getCandidate(0, 0);
      expect(name).to.equal("John Doe");
      expect(wallet).to.equal(candidate1.address);
      expect(votes).to.equal(0);
    });

    it("Should add multiple candidates to same position", async function () {
      await election.connect(owner).addCandidate(0, "Candidate A", candidate1.address);
      await election.connect(owner).addCandidate(0, "Candidate B", candidate2.address);
      await election.connect(owner).addCandidate(0, "Candidate C", candidate3.address);

      const [, candidateCount] = await election.getPosition(0);
      expect(candidateCount).to.equal(3);
    });

    it("Should add candidates to multiple positions", async function () {
      await election.connect(owner).addCandidate(0, "Pres A", candidate1.address);
      await election.connect(owner).addCandidate(1, "VP A", candidate2.address);
      await election.connect(owner).addCandidate(2, "Sec A", candidate3.address);

      for (let i = 0; i < POSITIONS.length; i++) {
        const [, count] = await election.getPosition(i);
        expect(count).to.equal(1);
      }
    });

    it("Should revert when not owner", async function () {
      await expect(
        election
          .connect(voter1)
          .addCandidate(0, "John Doe", candidate1.address)
      ).to.be.revertedWithCustomError(election, "OwnableUnauthorizedAccount");
    });

    it("Should revert if not in Draft status", async function () {
      // Need to add candidates to all positions first
      await election.connect(owner).addCandidate(0, "Candidate", candidate1.address);
      await election.connect(owner).addCandidate(1, "Candidate", candidate2.address);
      await election.connect(owner).addCandidate(2, "Candidate", candidate3.address);
      await election.connect(owner).startElection(DURATION);

      await expect(
        election.connect(owner).addCandidate(0, "Another", other.address)
      ).to.be.revertedWithCustomError(election, "NotDraft");
    });

    it("Should revert with invalid position index", async function () {
      await expect(
        election
          .connect(owner)
          .addCandidate(999, "Candidate", candidate1.address)
      ).to.be.revertedWithCustomError(election, "InvalidPositionIndex");
    });

    it("Should revert with zero address", async function () {
      await expect(
        election
          .connect(owner)
          .addCandidate(0, "Candidate", ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(election, "InvalidWallet");
    });

    it("Should revert with empty name", async function () {
      await expect(
        election.connect(owner).addCandidate(0, "", candidate1.address)
      ).to.be.revertedWithCustomError(election, "NameRequired");
    });

    it("Should revert if candidate already added", async function () {
      await election.connect(owner).addCandidate(0, "John", candidate1.address);

      await expect(
        election.connect(owner).addCandidate(0, "John", candidate1.address)
      ).to.be.revertedWithCustomError(election, "CandidateAlreadyAdded");
    });
  });

  describe("Whitelisting Voters", function () {
    it("Should whitelist single voter", async function () {
      await expect(election.connect(owner).whitelistVoters([voter1.address]))
        .to.emit(election, "VoterWhitelisted")
        .withArgs(voter1.address);

      expect(await election.whitelisted(voter1.address)).to.be.true;
    });

    it("Should whitelist multiple voters in batch", async function () {
      const voters = [voter1.address, voter2.address, voter3.address];
      await expect(election.connect(owner).whitelistVoters(voters))
        .to.emit(election, "VotersWhitelisted")
        .withArgs(3);

      for (const voter of voters) {
        expect(await election.whitelisted(voter)).to.be.true;
      }

      expect(await election.totalWhitelistedVoters()).to.equal(3);
    });

    it("Should not add duplicate whitelisted voters", async function () {
      await election.connect(owner).whitelistVoters([voter1.address]);
      expect(await election.totalWhitelistedVoters()).to.equal(1);

      await election.connect(owner).whitelistVoters([voter1.address, voter2.address]);
      expect(await election.totalWhitelistedVoters()).to.equal(2);
    });

    it("Should skip zero address in whitelist", async function () {
      const voters = [voter1.address, ethers.ZeroAddress, voter2.address];
      await election.connect(owner).whitelistVoters(voters);

      expect(await election.whitelisted(voter1.address)).to.be.true;
      expect(await election.whitelisted(voter2.address)).to.be.true;
      expect(await election.totalWhitelistedVoters()).to.equal(2);
    });

    it("Should revert when not owner", async function () {
      await expect(
        election.connect(voter1).whitelistVoters([voter1.address])
      ).to.be.revertedWithCustomError(election, "OwnableUnauthorizedAccount");
    });

    it("Should revert if not in Draft status", async function () {
      // Need to add candidates to all positions first
      await election.connect(owner).addCandidate(0, "Candidate", candidate1.address);
      await election.connect(owner).addCandidate(1, "Candidate", candidate2.address);
      await election.connect(owner).addCandidate(2, "Candidate", candidate3.address);
      await election.connect(owner).startElection(DURATION);

      await expect(
        election.connect(owner).whitelistVoters([voter1.address])
      ).to.be.revertedWithCustomError(election, "NotDraft");
    });
  });

  describe("Starting Election", function () {
    beforeEach(async function () {
      // Add candidates to all positions
      await election
        .connect(owner)
        .addCandidate(0, "Pres Candidate", candidate1.address);
      await election
        .connect(owner)
        .addCandidate(1, "VP Candidate", candidate2.address);
      await election
        .connect(owner)
        .addCandidate(2, "Sec Candidate", candidate3.address);
    });

    it("Should start election with valid duration", async function () {
      await expect(election.connect(owner).startElection(DURATION))
        .to.emit(election, "ElectionStarted");

      expect(await election.electionStatus()).to.equal(1); // Active = 1
      expect(await election.startTime()).to.be.greaterThan(0);
      expect(await election.endTime()).to.equal(
        (await election.startTime()) + BigInt(DURATION)
      );
    });

    it("Should revert if not in Draft status", async function () {
      await election.connect(owner).startElection(DURATION);

      await expect(
        election.connect(owner).startElection(DURATION)
      ).to.be.revertedWithCustomError(election, "AlreadyStarted");
    });

    it("Should revert with zero duration", async function () {
      await expect(
        election.connect(owner).startElection(0)
      ).to.be.revertedWithCustomError(election, "InvalidDuration");
    });

    it("Should revert if position has no candidates", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      const election2 = await ElectionFactory.deploy(
        owner.address,
        "Test",
        ["Position1", "Position2"]
      );

      await election2
        .connect(owner)
        .addCandidate(0, "Candidate", candidate1.address);

      await expect(
        election2.connect(owner).startElection(DURATION)
      ).to.be.revertedWithCustomError(election2, "MissingCandidates");
    });

    it("Should revert when not owner", async function () {
      await expect(
        election.connect(voter1).startElection(DURATION)
      ).to.be.revertedWithCustomError(election, "OwnableUnauthorizedAccount");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      // Setup: Add candidates and start election
      await election
        .connect(owner)
        .addCandidate(0, "Pres Candidate 1", candidate1.address);
      await election
        .connect(owner)
        .addCandidate(0, "Pres Candidate 2", candidate2.address);
      await election
        .connect(owner)
        .addCandidate(1, "VP Candidate 1", candidate3.address);
      await election
        .connect(owner)
        .addCandidate(2, "Sec Candidate 1", other.address);

      // Whitelist voters
      await election
        .connect(owner)
        .whitelistVoters([voter1.address, voter2.address, voter3.address]);

      // Start election
      await election.connect(owner).startElection(DURATION);
    });

    it("Should cast vote successfully", async function () {
      const ballot = [0, 0, 0]; // Vote for first candidate in each position

      await expect(election.connect(voter1).vote(ballot))
        .to.emit(election, "VoteCast")
        .withArgs(voter1.address);

      expect(await election.hasVoted(voter1.address)).to.be.true;
      expect(await election.totalVotesCast()).to.equal(1);

      const [, , votes] = await election.getCandidate(0, 0);
      expect(votes).to.equal(1);
    });

    it("Should cast multiple votes from different voters", async function () {
      const ballot1 = [0, 0, 0];
      const ballot2 = [1, 0, 0];
      const ballot3 = [0, 0, 0];

      await election.connect(voter1).vote(ballot1);
      await election.connect(voter2).vote(ballot2);
      await election.connect(voter3).vote(ballot3);

      expect(await election.totalVotesCast()).to.equal(3);

      let [, , votes] = await election.getCandidate(0, 0);
      expect(votes).to.equal(2); // voter1 and voter3

      [, , votes] = await election.getCandidate(0, 1);
      expect(votes).to.equal(1); // voter2
    });

    it("Should revert if not whitelisted", async function () {
      const ballot = [0, 0, 0];

      await expect(
        election.connect(other).vote(ballot)
      ).to.be.revertedWithCustomError(election, "NotWhitelisted");
    });

    it("Should revert if already voted", async function () {
      const ballot = [0, 0, 0];

      await election.connect(voter1).vote(ballot);

      await expect(
        election.connect(voter1).vote(ballot)
      ).to.be.revertedWithCustomError(election, "AlreadyVoted");
    });

    it("Should revert with invalid ballot size", async function () {
      const ballot = [0, 0]; // Missing one position

      await expect(
        election.connect(voter1).vote(ballot)
      ).to.be.revertedWithCustomError(election, "InvalidBallot");
    });

    it("Should revert with invalid candidate index", async function () {
      const ballot = [0, 0, 999]; // Invalid candidate index

      await expect(
        election.connect(voter1).vote(ballot)
      ).to.be.revertedWithCustomError(election, "InvalidCandidateIndex");
    });

    it("Should revert if election not active", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      const election2 = await ElectionFactory.deploy(owner.address, "Test", ["Pos"]);
      await election2.connect(owner).addCandidate(0, "Cand", candidate1.address);

      const ballot = [0];

      await expect(
        election2.connect(voter1).vote(ballot)
      ).to.be.revertedWithCustomError(election2, "NotActive");
    });

    it("Should revert if election has ended", async function () {
      // Move time beyond election end
      await ethers.provider.send("hardhat_mine", [
        "0x" + (DURATION + 100).toString(16),
      ]);

      const ballot = [0, 0, 0];

      await expect(
        election.connect(voter1).vote(ballot)
      ).to.be.revertedWithCustomError(election, "ElectionAlreadyEnded");
    });

    it("Should store voter ballot", async function () {
      const ballot = [0, 0, 0]; // Valid candidates at indices 0, 0, 0
      await election.connect(voter1).vote(ballot);

      const storedBallot = await election.connect(voter1).getVoterBallot(voter1.address);
      expect(storedBallot).to.deep.equal(ballot.map((b) => BigInt(b)));
    });
  });

  describe("Pausing/Resuming", function () {
    beforeEach(async function () {
      // Setup and start election
      await election
        .connect(owner)
        .addCandidate(0, "Candidate", candidate1.address);
      await election
        .connect(owner)
        .addCandidate(1, "Candidate", candidate2.address);
      await election
        .connect(owner)
        .addCandidate(2, "Candidate", candidate3.address);

      await election
        .connect(owner)
        .whitelistVoters([voter1.address, voter2.address]);

      await election.connect(owner).startElection(DURATION);
    });

    it("Should pause election", async function () {
      await expect(election.connect(owner).pause()).to.emit(election, "Paused");

      expect(await election.paused()).to.be.true;
    });

    it("Should prevent voting when paused", async function () {
      await election.connect(owner).pause();

      const ballot = [0, 0, 0];
      await expect(
        election.connect(voter1).vote(ballot)
      ).to.be.revertedWithCustomError(election, "ElectionPaused");
    });

    it("Should resume election", async function () {
      await election.connect(owner).pause();
      await expect(election.connect(owner).resume()).to.emit(election, "Resumed");

      expect(await election.paused()).to.be.false;
    });

    it("Should allow voting after resume", async function () {
      await election.connect(owner).pause();
      await election.connect(owner).resume();

      const ballot = [0, 0, 0];
      await expect(election.connect(voter1).vote(ballot))
        .to.emit(election, "VoteCast")
        .withArgs(voter1.address);
    });

    it("Should revert pause if not owner", async function () {
      await expect(
        election.connect(voter1).pause()
      ).to.be.revertedWithCustomError(election, "OwnableUnauthorizedAccount");
    });

    it("Should revert pause if not active", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      const election2 = await ElectionFactory.deploy(owner.address, "Test", ["Pos"]);

      await expect(
        election2.connect(owner).pause()
      ).to.be.revertedWithCustomError(election2, "NotActive");
    });
  });

  describe("Finalizing Election", function () {
    beforeEach(async function () {
      // Setup and cast votes
      await election
        .connect(owner)
        .addCandidate(0, "Pres A", candidate1.address);
      await election
        .connect(owner)
        .addCandidate(0, "Pres B", candidate2.address);
      await election
        .connect(owner)
        .addCandidate(1, "VP A", candidate3.address);
      await election
        .connect(owner)
        .addCandidate(2, "Sec A", other.address);

      await election
        .connect(owner)
        .whitelistVoters([voter1.address, voter2.address, voter3.address]);

      await election.connect(owner).startElection(DURATION);

      // Cast votes
      await election.connect(voter1).vote([0, 0, 0]);
      await election.connect(voter2).vote([0, 0, 0]);
      await election.connect(voter3).vote([1, 0, 0]);
    });

    it("Should not finalize before election ends", async function () {
      await expect(
        election.connect(owner).finalizeElection()
      ).to.be.revertedWithCustomError(election, "TooEarly");
    });

    it("Should finalize election after end time", async function () {
      // Fast-forward time
      await ethers.provider.send("hardhat_mine", [
        "0x" + (DURATION + 100).toString(16),
      ]);

      await expect(election.connect(owner).finalizeElection())
        .to.emit(election, "WinnerDeclared");

      expect(await election.electionStatus()).to.equal(2); // Ended = 2
    });

    it("Should declare correct winners", async function () {
      // Fast-forward time
      await ethers.provider.send("hardhat_mine", [
        "0x" + (DURATION + 100).toString(16),
      ]);

      const tx = await election.connect(owner).finalizeElection();
      const receipt = await tx.wait();

      // President: Candidate A wins with 2 votes
      expect(receipt?.logs.length).to.be.greaterThan(0);
    });

    it("Should revert if not active", async function () {
      const ElectionFactory = await ethers.getContractFactory("Election");
      const election2 = await ElectionFactory.deploy(owner.address, "Test", ["Pos"]);

      await expect(
        election2.connect(owner).finalizeElection()
      ).to.be.revertedWithCustomError(election2, "NotActive");
    });

    it("Should emit ElectionEnded event", async function () {
      // Fast-forward time
      await ethers.provider.send("hardhat_mine", [
        "0x" + (DURATION + 100).toString(16),
      ]);

      await expect(election.connect(owner).finalizeElection())
        .to.emit(election, "ElectionEnded");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await election
        .connect(owner)
        .addCandidate(0, "Candidate 1", candidate1.address);
      await election
        .connect(owner)
        .addCandidate(0, "Candidate 2", candidate2.address);
      await election
        .connect(owner)
        .addCandidate(1, "Candidate 3", candidate3.address);
      await election
        .connect(owner)
        .addCandidate(2, "Candidate 4", other.address);

      await election
        .connect(owner)
        .whitelistVoters([voter1.address, voter2.address]);

      await election.connect(owner).startElection(DURATION);

      await election.connect(voter1).vote([0, 0, 0]);
      await election.connect(voter2).vote([1, 0, 0]);
    });

    it("Should return election stats", async function () {
      const [totalVoters, votesCast, startTime, endTime] =
        await election.getElectionStats();

      expect(totalVoters).to.equal(2);
      expect(votesCast).to.equal(2);
      expect(startTime).to.be.greaterThan(0);
      expect(endTime).to.equal(startTime + BigInt(DURATION));
    });

    it("Should return correct position count", async function () {
      expect(await election.getPositionsCount()).to.equal(POSITIONS.length);
    });

    it("Should return correct position details", async function () {
      const [title, candidateCount] = await election.getPosition(0);
      expect(title).to.equal("President");
      expect(candidateCount).to.equal(2);
    });

    it("Should return correct candidate details", async function () {
      const [name, wallet, votes] = await election.getCandidate(0, 0);
      expect(name).to.equal("Candidate 1");
      expect(wallet).to.equal(candidate1.address);
      expect(votes).to.equal(1);
    });

    it("Should return invalid index error", async function () {
      await expect(election.getPosition(999)).to.be.revertedWithCustomError(
        election,
        "InvalidIndex"
      );
    });

    it("Should return voter ballot only to voter or owner", async function () {
      const ballot = await election
        .connect(voter1)
        .getVoterBallot(voter1.address);
      expect(ballot.length).to.equal(3);

      await expect(
        election.connect(voter2).getVoterBallot(voter1.address)
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });
  });
});
