const hre = require("hardhat");

async function main() {
  const contractAddress = "0xCCc95e7279813Ee1e4073e39280171C44C12431B";
  
  // Constructor arguments from deployment
  // Constructor: (address _pusdToken, address _rewardDistributor, address _lockToEarnPool, address _developmentFund, address initialOwner)
  const constructorArgs = [
    "0xCDaAf6f8c59962c7807c62175E21487CB640d3b8", // _pusdToken
    "0xFeAE0806312D665e92EdA94577EfD4F8C6658b11", // _rewardDistributor
    "0x62097798b95748d315adb423ff58dae11b3c5E52", // _lockToEarnPool
    "0xBe98454B86E30859c823F3556592a8e273666666", // _developmentFund (using deployer address as default)
    "0xBe98454B86E30859c823F3556592a8e273666666", // initialOwner (deployer)
  ];

  console.log("🔍 Verifying PUSDLottery contract on Polygonscan...");
  console.log(`   Address: ${contractAddress}`);
  console.log(`   Constructor args:`, constructorArgs);

  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });
    
    console.log("✅ Contract verified successfully!");
    console.log(`   View on Polygonscan: https://polygonscan.com/address/${contractAddress}#code`);
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Contract is already verified!");
      console.log(`   View on Polygonscan: https://polygonscan.com/address/${contractAddress}#code`);
    } else {
      console.error("❌ Verification failed:", error.message);
      
      // Try with different developmentFund if provided
      if (process.env.DEVELOPMENT_FUND) {
        console.log("\n🔄 Retrying with custom developmentFund address...");
        const altArgs = [...constructorArgs];
        altArgs[3] = process.env.DEVELOPMENT_FUND;
        
        try {
          await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: altArgs,
          });
          console.log("✅ Contract verified with custom developmentFund!");
        } catch (retryError) {
          console.error("❌ Retry also failed:", retryError.message);
          console.log("\n💡 Manual verification:");
          console.log("   1. Go to: https://polygonscan.com/address/" + contractAddress);
          console.log("   2. Click 'Contract' tab");
          console.log("   3. Click 'Verify and Publish'");
          console.log("   4. Select 'Solidity (Standard JSON Input)'");
          console.log("   5. Upload artifacts/contracts/PUSDLottery.sol/PUSDLottery.json");
          console.log("   6. Enter constructor arguments:", constructorArgs);
        }
      } else {
      console.log("\n💡 Manual verification steps:");
      console.log("   1. Go to: https://polygonscan.com/address/" + contractAddress);
      console.log("   2. Click 'Contract' tab");
      console.log("   3. Click 'Verify and Publish'");
      console.log("   4. Select 'Solidity (Standard JSON Input)'");
      console.log("   5. Compiler: 0.8.20");
      console.log("   6. Optimization: Yes, 200 runs");
      console.log("   7. Via IR: Yes");
      console.log("   8. Upload the JSON file from: artifacts/contracts/PUSDLottery.sol/PUSDLottery.json");
      console.log("   9. Constructor arguments (ABI-encoded):");
      console.log("      ", constructorArgs);
      console.log("\n   Or use Hardhat flatten:");
      console.log("   npx hardhat flatten contracts/PUSDLottery.sol > PUSDLottery-flattened.sol");
      console.log("   Then use 'Solidity (Single file)' option with flattened file");
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

