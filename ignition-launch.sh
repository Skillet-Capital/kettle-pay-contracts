# # BASE PAYMENT DEPLOYMENT
npx hardhat ignition deploy ignition/modules/v1/PaymentIntentHandler.ts --parameters ignition/params/base.json --network base

# # BASE DEPLOYMENT
# npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/base.json --network base
# npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/base.json --network base

# # ARBITRUM DEPLOYMENT
# npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/arbitrum.json --network arbitrum
# npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/arbitrum.json --network arbitrum

# # POLYGON DEPLOYMENT
# npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/polygon.json --network polygon
# npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/polygon.json --network polygon

# # OPTIMISM DEPLOYMENT
# npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/optimism.json --network optimism
# npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/optimism.json --network optimism

# # AVALANCHE DEPLOYMENT
# npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/avalanche.json --network avalanche
# npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/avalanche.json --network avalanche

# # MAINNET DEPLOYMENT
# npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/mainnet.json --network mainnet
# npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/mainnet.json --network mainnet
