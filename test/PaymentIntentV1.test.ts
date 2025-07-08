import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { encodeAbiParameters, getAddress, parseAbiParameters, parseGwei, parseUnits, zeroAddress } from "viem";
import { randomBytes } from "crypto";

type PaymentIntentStruct = {
  amount: bigint;
  feeBps: bigint;
  feeRecipient: `0x${string}`;
  merchant: `0x${string}`;
  salt: bigint;
};

function padAddress(address: `0x${string}`): `0x${string}` {
  return `0x${address.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

function parsePaymentIntentSuccessEvent(event: any) {
  return {
    nonce: event.args.nonce,
    merchant: event.args.merchant,
    amount: event.args.amount,
    feeBps: event.args.feeBps,
    feeRecipient: event.args.feeRecipient,
    salt: event.args.salt,
  };
}

function parsePaymentIntentFailedEvent(event: any) {
  return {
    nonce: event.args.nonce,
    reason: event.args.reason,
  };
}

function randomBytes32(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

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
      const { paymentIntentHandler, usdc, owner, publicClient } = await loadFixture(deployPaymentIntentHandlerFixture);

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

      const hash = await paymentIntentHandler.write.executeHook([
        randomBytes32(),
        1,
        padAddress(usdc.address),
        padAddress(paymentIntentHandler.address),
        intent.amount,
        padAddress(owner.account.address),
        BigInt(100),
        BigInt(0),
        BigInt(0),
        encodedHookData
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const PaymentIntentSuccessEvents = await paymentIntentHandler.getEvents.PaymentIntentSuccess();
      expect(PaymentIntentSuccessEvents).to.have.lengthOf(1);
      console.log(parsePaymentIntentSuccessEvent(PaymentIntentSuccessEvents[0]));

      const rejected = await paymentIntentHandler.write.executeHook([
        randomBytes32(),
        1,
        padAddress(usdc.address),
        padAddress(paymentIntentHandler.address),
        intent.amount,
        padAddress(owner.account.address),
        BigInt(100),
        BigInt(0),
        BigInt(0),
        encodedHookData
      ]);

      await publicClient.waitForTransactionReceipt({ hash: rejected });

      const PaymentIntentFailedEvents = await paymentIntentHandler.getEvents.PaymentIntentFailed();
      expect(PaymentIntentFailedEvents).to.have.lengthOf(1);
      console.log(parsePaymentIntentFailedEvent(PaymentIntentFailedEvents[0]));
    });

    it("Should reject if invalid signature", async function () {
      const { paymentIntentHandler, usdc, publicClient, owner } = await loadFixture(deployPaymentIntentHandlerFixture);

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

      const rejected = await paymentIntentHandler.write.executeHook([
        randomBytes32(),
        1,
        padAddress(usdc.address),
        padAddress(paymentIntentHandler.address),
        intent.amount,
        padAddress(owner.account.address),
        BigInt(100),
        BigInt(0),
        BigInt(0),
        encodedHookData
      ]);
      await publicClient.waitForTransactionReceipt({ hash: rejected });

      const PaymentIntentFailedEvents = await paymentIntentHandler.getEvents.PaymentIntentFailed();
      expect(PaymentIntentFailedEvents).to.have.lengthOf(1);

      const failureEvent = parsePaymentIntentFailedEvent(PaymentIntentFailedEvents[0]);
      expect(failureEvent.reason).to.equal("InvalidVParameter");

      // make sure the salt is not logged as used yet
      const salts = await paymentIntentHandler.read.salts([intent.salt]);
      expect(salts).to.be.false;

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

      const rejected2 = await paymentIntentHandler.write.executeHook([
        randomBytes32(),
        1,
        padAddress(usdc.address),
        padAddress(paymentIntentHandler.address),
        intent.amount,
        padAddress(owner.account.address),
        BigInt(100),
        BigInt(0),
        BigInt(0),
        encodedHookData2
      ]);

      await publicClient.waitForTransactionReceipt({ hash: rejected2 });

      const PaymentIntentFailedEvents2 = await paymentIntentHandler.getEvents.PaymentIntentFailed();
      expect(PaymentIntentFailedEvents2).to.have.lengthOf(1);

      const failureEvent2 = parsePaymentIntentFailedEvent(PaymentIntentFailedEvents2[0]);
      expect(failureEvent2.reason).to.equal("InvalidSignature");

      // make sure the salt is not logged as used
      const salts2 = await paymentIntentHandler.read.salts([intent.salt + 1n]);
      expect(salts2).to.be.false;
    });
  });
});
