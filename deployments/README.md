# Deployments Directory

This directory stores deployment records for the VotingFactory contract.

## File Format

Each deployment creates a JSON file with:
- Network name
- Factory address
- Treasury address
- Creation fee
- Deployer address
- Chain ID
- Timestamp

## Networks

- `localhost-*.json` - Local Hardhat deployments
- `sepolia-*.json` - Sepolia testnet deployments
- `mainnet-*.json` - Mainnet deployments (if applicable)

## Notes

Old localhost deployment files have been cleaned. Only production/testnet deployments will be kept here.
