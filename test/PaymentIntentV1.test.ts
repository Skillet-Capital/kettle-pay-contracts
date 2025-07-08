import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { encodeAbiParameters, getAddress, parseAbiParameters, parseGwei, parseUnits, zeroAddress } from "viem";
import { signTypedData } from "viem/accounts";

type PaymentIntentStruct = {
  amount: bigint;
  feeBps: bigint;
  feeRecipient: `0x${string}`;
  merchant: `0x${string}`;
  salt: bigint;
};

type PaymentIntentHookDataStruct = {
  intent: PaymentIntentStruct;
  signature: `0x${string}`;
};

describe("PaymentIntentHandlerV1", function () {
  async function deployPaymentIntentHandlerFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, feeRecipient] = await hre.viem.getWalletClients();

    const usdc = await hre.viem.deployContract("MockERC20");
    const paymentIntentHandler = await hre.viem.deployContract("PaymentIntentHandlerV1", [usdc.address, owner.account.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      usdc,
      paymentIntentHandler,
      owner,
      feeRecipient,
      publicClient,
    };
  }

  describe("Deployment", function () {

    let intent: PaymentIntentStruct;
    let signature: `0x${string}`;

    this.beforeEach(async function () {
      const { owner, feeRecipient, publicClient, paymentIntentHandler } = await loadFixture(deployPaymentIntentHandlerFixture);

      intent = {
        amount: parseUnits("100", 6),
        feeBps: BigInt(100),
        feeRecipient: feeRecipient.account.address,
        merchant: owner.account.address,
        salt: BigInt(1),
      } as PaymentIntentStruct;

      signature = await owner.signTypedData({
        domain: {
          name: "PaymentIntentHandlerV1",
          version: "1",
          chainId: await publicClient.getChainId(),
          verifyingContract: paymentIntentHandler.address,
        },
        types: {
          PaymentIntent: [
            { name: "amount", type: "uint256" },
            { name: "feeBps", type: "uint256" },
            { name: "feeRecipient", type: "address" },
            { name: "merchant", type: "address" },
            { name: "salt", type: "uint256" },
          ],
        },
        primaryType: "PaymentIntent",
        message: intent,
        account: owner.account.address,
      });
    });

    it("Should deploy the payment intent handler", async function () {
      const { paymentIntentHandler, usdc } = await loadFixture(deployPaymentIntentHandlerFixture);

      await usdc.write.mint([paymentIntentHandler.address, intent.amount]);

      const encodedHookData = encodeAbiParameters(
        [
          {
            name: "hookData",
            type: "tuple", // ← could be "PaymentIntentHookData" but "tuple" is fine
            components: [
              {
                name: "intent",
                type: "tuple", // ← this could be "PaymentIntent" for clarity
                components: [
                  { name: "amount", type: "uint256" },
                  { name: "feeBps", type: "uint256" },
                  { name: "feeRecipient", type: "address" },
                  { name: "merchant", type: "address" },
                  { name: "salt", type: "uint256" },
                ],
              },
              { name: "signature", type: "bytes" },
            ],
          },
        ],
        [
          {
            intent: {
              amount: intent.amount,
              feeBps: intent.feeBps,
              feeRecipient: intent.feeRecipient,
              merchant: intent.merchant,
              salt: intent.salt,
            },
            signature,
          },
        ]
      );

      await paymentIntentHandler.write.executeHook([intent.amount, BigInt(0), zeroAddress, encodedHookData]);

      await expect(paymentIntentHandler.write.executeHook([intent.amount, BigInt(0), zeroAddress, encodedHookData])).to.be.rejectedWith(
        "Salt already used"
      );
    });

    it("Should reject if invalid signature", async function () {
      const { paymentIntentHandler, usdc } = await loadFixture(deployPaymentIntentHandlerFixture);

      await usdc.write.mint([paymentIntentHandler.address, intent.amount]);

      const encodedHookData = encodeAbiParameters(
        [
          {
            name: "hookData",
            type: "tuple", // ← could be "PaymentIntentHookData" but "tuple" is fine
            components: [
              {
                name: "intent",
                type: "tuple", // ← this could be "PaymentIntent" for clarity
                components: [
                  { name: "amount", type: "uint256" },
                  { name: "feeBps", type: "uint256" },
                  { name: "feeRecipient", type: "address" },
                  { name: "merchant", type: "address" },
                  { name: "salt", type: "uint256" },
                ],
              },
              { name: "signature", type: "bytes" },
            ],
          },
        ],
        [
          {
            intent: {
              amount: intent.amount,
              feeBps: intent.feeBps,
              feeRecipient: intent.feeRecipient,
              merchant: intent.merchant,
              salt: intent.salt,
            },
            signature: "0x0000000000000000000000000000000000000000000000000000000000000000",
          },
        ]
      );

      await expect(paymentIntentHandler.write.executeHook([intent.amount, BigInt(0), zeroAddress, encodedHookData])).to.be.rejectedWith(
        "InvalidVParameter"
      );

      const encodedHookData2 = encodeAbiParameters(
        [
          {
            name: "hookData",
            type: "tuple", // ← could be "PaymentIntentHookData" but "tuple" is fine
            components: [
              {
                name: "intent",
                type: "tuple", // ← this could be "PaymentIntent" for clarity
                components: [
                  { name: "amount", type: "uint256" },
                  { name: "feeBps", type: "uint256" },
                  { name: "feeRecipient", type: "address" },
                  { name: "merchant", type: "address" },
                  { name: "salt", type: "uint256" },
                ],
              },
              { name: "signature", type: "bytes" },
            ],
          },
        ],
        [
          {
            intent: {
              amount: intent.amount,
              feeBps: intent.feeBps,
              feeRecipient: intent.feeRecipient,
              merchant: intent.merchant,
              salt: intent.salt + 1n,
            },
            signature,
          },
        ]
      );

      await expect(paymentIntentHandler.write.executeHook([intent.amount, BigInt(0), zeroAddress, encodedHookData2])).to.be.rejectedWith(
        "InvalidSignature"
      );
    });
  });
});
