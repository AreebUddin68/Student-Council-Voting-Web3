import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🔍 Checking election details...\n");

  // Connect to local Hardhat node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // Election address from your screenshot (add full address with proper checksum)
  const electionAddress = "0x6D544390Eb535d61e196c87d6b9c80dCD8628Acd";
  
  // Load ABI
  const artifactPath = path.join(__dirname, "../artifacts/contracts/Election.sol/Election.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  // Create contract instance
  const election = new ethers.Contract(electionAddress, artifact.abi, provider);
  
  try {
    // Get election details
    const title = await election.electionTitle();
    const status = await election.electionStatus();
    const positionsCount = await election.getPositionsCount();
    
    console.log(`📋 Election: ${title}`);
    console.log(`📊 Status: ${status}`);
    console.log(`📍 Positions: ${positionsCount.toString()}\n`);
    
    // Check each position
    for (let i = 0; i < Number(positionsCount); i++) {
      const position = await election.getPosition(i);
      console.log(`\n📌 Position ${i + 1}: ${position[0]}`);
      console.log(`   Candidates: ${position[1].toString()}`);
      
      // Get each candidate
      for (let j = 0; j < Number(position[1]); j++) {
        const candidate = await election.getCandidate(i, j);
        console.log(`   ${j + 1}. ${candidate[0]} (${candidate[1]})`);
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
