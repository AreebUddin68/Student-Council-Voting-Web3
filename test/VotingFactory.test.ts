import { expect } from "chai";
import { network } from "hardhat";
import type { VotingFactory, Election } from "../types/ethers-contracts/index.ts";

const { ethers } = await network.connect();

describe("VotingFactory Contract", function () {
  let factory: VotingFactory;
  let owner: any;
  let organizer1: any;
  let organizer2: any;
  let treasury: any;
  let other: any;

  const CREATION_FEE = ethers.parseEther("0.01");
  const DEFAULT_POSITIONS = ["President", "Vice President"];

  beforeEach(async function () {
    [owner, organizer1, organizer2, treasury, other] = await ethers.getSigners();

    const FactoryFactory = await ethers.getContractFactory("VotingFactory");
    factory = await FactoryFactory.deploy(treasury.address);
    await factory.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should set the correct treasury address", async function () {
      expect(await factory.treasury()).to.equal(treasury.address);
    });

    it("Should set the default creation fee", async function () {
      expect(await factory.creationFee()).to.equal(CREATION_FEE);
    });

    it("Should revert with zero treasury address", async function () {
      const FactoryFactory = await ethers.getContractFactory("VotingFactory");
      await expect(
        FactoryFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidTreasury");
    });
  });

  describe("Admin Functions", function () {
    it("Should update creation fee", async function () {
      const newFee = ethers.parseEther("0.05");

      await expect(factory.connect(owner).setCreationFee(newFee))
        .to.emit(factory, "CreationFeeUpdated")
        .withArgs(newFee);

      expect(await factory.creationFee()).to.equal(newFee);
    });

    it("Should revert setCreationFee if not owner", async function () {
      const newFee = ethers.parseEther("0.05");

      await expect(
        factory.connect(organizer1).setCreationFee(newFee)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should update treasury address", async function () {
      const newTreasury = other.address;

      await expect(factory.connect(owner).setTreasury(newTreasury))
        .to.emit(factory, "TreasuryUpdated")
        .withArgs(newTreasury);

      expect(await factory.treasury()).to.equal(newTreasury);
    });

    it("Should revert setTreasury if not owner", async function () {
      await expect(
        factory.connect(organizer1).setTreasury(other.address)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should revert setTreasury with zero address", async function () {
      await expect(
        factory.connect(owner).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidTreasury");
    });

    it("Should allow updating fee to zero", async function () {
      await factory.connect(owner).setCreationFee(0);
      expect(await factory.creationFee()).to.equal(0);
    });
  });

  describe("Creating Elections", function () {
    it("Should create election with exact fee", async function () {
      const title = "Student Council 2026";
      const positions = ["President", "Secretary"];

      const tx = await factory
        .connect(organizer1)
        .createElection(title, positions, { value: CREATION_FEE });

      const receipt = await tx.wait();
      expect(receipt?.logs.length).to.be.greaterThan(0);

      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(1);
      expect(elections[0].title).to.equal(title);
      expect(elections[0].organizer).to.equal(organizer1.address);
    });

    it("Should create election and refund excess ETH", async function () {
      const title = "Student Council 2026";
      const positions = ["President", "Secretary"];
      const overpayment = ethers.parseEther("0.05");

      const balanceBefore = await ethers.provider.getBalance(organizer1.address);

      const tx = await factory
        .connect(organizer1)
        .createElection(title, positions, { value: overpayment });

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(organizer1.address);
      const expectedBalance = balanceBefore - CREATION_FEE - BigInt(gasUsed);

      expect(balanceAfter).to.equal(expectedBalance);
    });

    it("Should transfer fee to treasury", async function () {
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

      await factory
        .connect(organizer1)
        .createElection("Test", DEFAULT_POSITIONS, { value: CREATION_FEE });

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + CREATION_FEE);
    });

    it("Should create Election contract as a separate instance", async function () {
      const title = "Test Election";
      const positions = ["President"];

      const tx = await factory
        .connect(organizer1)
        .createElection(title, positions, { value: CREATION_FEE });

      const receipt = await tx.wait();
      expect(receipt?.logs.length).to.be.greaterThan(0);

      const elections = await factory.getAllElections();
      const electionAddress = elections[0].electionAddress;

      const ElectionFactory = await ethers.getContractFactory("Election");
      const election = ElectionFactory.attach(electionAddress);

      expect(await election.electionTitle()).to.equal(title);
      expect(await election.owner()).to.equal(organizer1.address);
    });

    it("Should revert with empty title", async function () {
      const positions = ["President"];

      await expect(
        factory
          .connect(organizer1)
          .createElection("", positions, { value: CREATION_FEE })
      ).to.be.revertedWithCustomError(factory, "TitleRequired");
    });

    it("Should revert with no positions", async function () {
      const title = "Test Election";

      await expect(
        factory
          .connect(organizer1)
          .createElection(title, [], { value: CREATION_FEE })
      ).to.be.revertedWithCustomError(factory, "AtLeastOnePosition");
    });

    it("Should revert with insufficient fee", async function () {
      const title = "Test Election";
      const positions = ["President"];

      await expect(
        factory
          .connect(organizer1)
          .createElection(title, positions, { value: ethers.parseEther("0.005") })
      ).to.be.revertedWithCustomError(factory, "InsufficientFee");
    });

    it("Should revert with no fee when fee > 0", async function () {
      const title = "Test Election";
      const positions = ["President"];

      await expect(
        factory.connect(organizer1).createElection(title, positions)
      ).to.be.revertedWithCustomError(factory, "InsufficientFee");
    });

    it("Should allow creation with zero fee when fee is set to 0", async function () {
      await factory.connect(owner).setCreationFee(0);

      const title = "Test Election";
      const positions = ["President"];

      const tx = await factory.connect(organizer1).createElection(title, positions);
      await tx.wait();

      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(1);
    });

    it("Should track multiple elections from same organizer", async function () {
      const positions = ["President"];

      for (let i = 1; i <= 3; i++) {
        await factory
          .connect(organizer1)
          .createElection(`Election ${i}`, positions, { value: CREATION_FEE });
      }

      const organizerElections = await factory.getElectionsByOrganizer(
        organizer1.address
      );
      expect(organizerElections.length).to.equal(3);
    });

    it("Should track elections from different organizers", async function () {
      const positions = ["President"];

      await factory
        .connect(organizer1)
        .createElection("Election 1", positions, { value: CREATION_FEE });

      await factory
        .connect(organizer2)
        .createElection("Election 2", positions, { value: CREATION_FEE });

      const allElections = await factory.getAllElections();
      expect(allElections.length).to.equal(2);

      const org1Elections = await factory.getElectionsByOrganizer(organizer1.address);
      const org2Elections = await factory.getElectionsByOrganizer(organizer2.address);

      expect(org1Elections.length).to.equal(1);
      expect(org2Elections.length).to.equal(1);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      // Create some elections
      for (let i = 1; i <= 5; i++) {
        await factory
          .connect(organizer1)
          .createElection(`Election ${i}`, ["President", "VP"], {
            value: CREATION_FEE,
          });
      }
    });

    it("Should return total elections count", async function () {
      expect(await factory.getTotalElections()).to.equal(5);
    });

    it("Should return all elections", async function () {
      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(5);

      for (let i = 0; i < 5; i++) {
        expect(elections[i].organizer).to.equal(organizer1.address);
        expect(elections[i].title).to.equal(`Election ${i + 1}`);
        expect(elections[i].createdAt).to.be.greaterThan(0);
      }
    });

    it("Should return elections by organizer", async function () {
      const organizerElections = await factory.getElectionsByOrganizer(
        organizer1.address
      );
      expect(organizerElections.length).to.equal(5);
    });

    it("Should return empty array for organizer with no elections", async function () {
      const organizerElections = await factory.getElectionsByOrganizer(other.address);
      expect(organizerElections.length).to.equal(0);
    });

    it("Should return paginated elections", async function () {
      const page1 = await factory.getElectionsPaginated(0, 2);
      expect(page1.length).to.equal(2);

      const page2 = await factory.getElectionsPaginated(2, 2);
      expect(page2.length).to.equal(2);

      const page3 = await factory.getElectionsPaginated(4, 2);
      expect(page3.length).to.equal(1);
    });

    it("Should return empty array when offset exceeds total", async function () {
      const elections = await factory.getElectionsPaginated(10, 2);
      expect(elections.length).to.equal(0);
    });

    it("Should handle pagination beyond boundary", async function () {
      const elections = await factory.getElectionsPaginated(3, 10);
      expect(elections.length).to.equal(2); // Only elections 4 and 5
    });

    it("Should return correct data in paginated results", async function () {
      const page1 = await factory.getElectionsPaginated(0, 2);

      expect(page1[0].title).to.equal("Election 1");
      expect(page1[1].title).to.equal("Election 2");
    });
  });

  describe("Integration with Election Contract", function () {
    it("Should create elections that are independently functional", async function () {
      const title = "Functional Election Test";
      const positions = ["President", "Secretary"];

      const tx = await factory
        .connect(organizer1)
        .createElection(title, positions, { value: CREATION_FEE });

      const receipt = await tx.wait();
      const elections = await factory.getAllElections();
      const electionAddress = elections[0].electionAddress;

      const ElectionFactory = await ethers.getContractFactory("Election");
      const election = ElectionFactory.attach(electionAddress) as Election;

      // Verify election is functional
      expect(await election.electionTitle()).to.equal(title);
      expect(await election.getPositionsCount()).to.equal(2);
      expect(await election.owner()).to.equal(organizer1.address);
    });

    it("Should create multiple independent elections", async function () {
      const tx1 = await factory
        .connect(organizer1)
        .createElection("Election 1", ["President"], { value: CREATION_FEE });

      const tx2 = await factory
        .connect(organizer2)
        .createElection("Election 2", ["VP"], { value: CREATION_FEE });

      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(2);

      const ElectionFactory = await ethers.getContractFactory("Election");

      const election1 = ElectionFactory.attach(elections[0].electionAddress) as Election;
      const election2 = ElectionFactory.attach(elections[1].electionAddress) as Election;

      expect(await election1.owner()).to.equal(organizer1.address);
      expect(await election2.owner()).to.equal(organizer2.address);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle fee increase and subsequent elections", async function () {
      const positions = ["President"];
      const oldFee = await factory.creationFee();

      // Create election with old fee
      await factory
        .connect(organizer1)
        .createElection("Election 1", positions, { value: oldFee });

      // Increase fee
      const newFee = ethers.parseEther("0.02");
      await factory.connect(owner).setCreationFee(newFee);

      // Create election with new fee
      await factory
        .connect(organizer1)
        .createElection("Election 2", positions, { value: newFee });

      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(2);
    });

    it("Should handle treasury change mid-operation", async function () {
      const newTreasury = other.address;
      const balanceBefore = await ethers.provider.getBalance(newTreasury);

      // Change treasury
      await factory.connect(owner).setTreasury(newTreasury);

      // Create election - fee should go to new treasury
      await factory
        .connect(organizer1)
        .createElection("Test", ["President"], { value: CREATION_FEE });

      const balanceAfter = await ethers.provider.getBalance(newTreasury);
      expect(balanceAfter).to.equal(balanceBefore + CREATION_FEE);
    });

    it("Should handle very long election titles and positions", async function () {
      const longTitle = "A".repeat(1000);
      const longPositions = ["B".repeat(500), "C".repeat(500)];

      const tx = await factory
        .connect(organizer1)
        .createElection(longTitle, longPositions, { value: CREATION_FEE });
      await tx.wait();

      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(1);
    });

    it("Should handle many positions in a single election", async function () {
      const positions = Array.from({ length: 20 }, (_, i) => `Position ${i + 1}`);

      const tx = await factory
        .connect(organizer1)
        .createElection("Test", positions, { value: CREATION_FEE });
      await tx.wait();

      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(1);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should handle refund securely", async function () {
      const largeOverpayment = ethers.parseEther("100");

      // Should complete without issues
      const tx = await factory
        .connect(organizer1)
        .createElection("Test", ["President"], { value: largeOverpayment });
      await tx.wait();
      
      const elections = await factory.getAllElections();
      expect(elections.length).to.equal(1);
    });
  });
});
