# BASE PAYMENT DEPLOYMENT
npx hardhat ignition deploy ignition/modules/v1/PaymentIntentHandler.ts --parameters ignition/params/base.json --network base

# BASE SWAP AND BURN DEPLOYMENT
npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/base.json --network base
npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/base.json --network base

# ARBITRUM DEPLOYMENT
npx hardhat ignition deploy ignition/modules/cctp/CCTPBurnHookWrapper.ts --parameters ignition/params/arbitrum.json --network arbitrum
npx hardhat ignition deploy ignition/modules/wrapper/SwapWrapper.ts --parameters ignition/params/arbitrum.json --network arbitrum
