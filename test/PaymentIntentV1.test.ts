import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { encodeAbiParameters, getAddress, keccak256, parseAbiParameters, parseGwei, parseUnits, zeroAddress } from "viem";
import { randomBytes } from "crypto";
import { toUtf8Bytes } from "ethers";

enum SignerType {
  MERCHANT,
  OPERATOR,
}

enum QuantityType {
  FIXED,
  UNLIMITED,
}

type PaymentIntentStruct = {
  amount: bigint;
  feeBps: bigint;
  feeRecipient: `0x${string}`;
  merchant: `0x${string}`;
  salt: bigint;
  signerType: SignerType;
  signer: `0x${string}`;
  quantityType: QuantityType;
  quantity: bigint;
  nonce: bigint;
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

describe("PaymentIntentHandlerV2", function () {
  async function deployPaymentIntentHandlerFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, feeRecipient, operator] = await hre.viem.getWalletClients();

    const usdc = await hre.viem.deployContract("MockERC20");
    const paymentIntentHandler = await hre.viem.deployContract("PaymentIntentHandlerV2", [usdc.address, owner.account.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      usdc,
      paymentIntentHandler,
      owner,
      feeRecipient,
      publicClient,
      operator,
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
        signerType: SignerType.MERCHANT,
        signer: owner.account.address,
        quantityType: QuantityType.FIXED,
        quantity: BigInt(1),
        nonce: BigInt(1),
      } as PaymentIntentStruct;

      signature = await owner.signTypedData({
        domain: {
          name: "PaymentIntentHandlerV2",
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
            { name: "quantityType", type: "uint8" },
            { name: "quantity", type: "uint256" },
            { name: "signerType", type: "uint8" },
            { name: "signer", type: "address" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "PaymentIntent",
        message: intent,
        account: owner.account.address,
      });
    });

    it("Should deploy the payment intent handler", async function () {
      const { paymentIntentHandler, usdc, owner, publicClient } = await loadFixture(deployPaymentIntentHandlerFixture);

      await usdc.write.mint([intent.merchant, intent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, intent.amount]);

      const hash = await paymentIntentHandler.write.localExecuteHook([
        intent,
        signature
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      // test failure because of over usage
      await expect(paymentIntentHandler.write.localExecuteHook([
        intent,
        signature
      ])).to.be.rejectedWith("Quantity already used");
    });

    it("Should allow merchant to update the nonce", async function () {
      const { owner, feeRecipient, publicClient, paymentIntentHandler, operator, usdc } = await loadFixture(deployPaymentIntentHandlerFixture);

      // execute the intent
      await usdc.write.mint([owner.account.address, intent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, intent.amount]);

      const hash = await paymentIntentHandler.write.localExecuteHook([
        intent,
        signature
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      // update the nonce
      const updatedIntent = {
        amount: parseUnits("100", 6),
        feeBps: BigInt(100),
        feeRecipient: feeRecipient.account.address,
        merchant: owner.account.address,
        salt: BigInt(1),
        signerType: SignerType.MERCHANT,
        signer: owner.account.address,
        quantityType: QuantityType.FIXED,
        quantity: BigInt(2),
        nonce: BigInt(2),
      } as PaymentIntentStruct;

      const updatedSignature = await operator.signTypedData({
        domain: {
          name: "PaymentIntentHandlerV2",
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
            { name: "quantityType", type: "uint8" },
            { name: "quantity", type: "uint256" },
            { name: "signerType", type: "uint8" },
            { name: "signer", type: "address" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "PaymentIntent",
        message: updatedIntent,
        account: owner.account.address,
      });

      await usdc.write.mint([owner.account.address, updatedIntent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, updatedIntent.amount]);

      await paymentIntentHandler.write.localExecuteHook([
        updatedIntent,
        updatedSignature
      ]);

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(2n);

      // test failure because of old nonce
      await expect(paymentIntentHandler.write.localExecuteHook([
        intent,
        updatedSignature
      ])).to.be.rejectedWith("Using old intent nonce");

      // test failure because of over usage
      await expect(paymentIntentHandler.write.localExecuteHook([
        updatedIntent,
        updatedSignature
      ])).to.be.rejectedWith("Quantity already used");
    });

    it("Should reject if invalid signature", async function () {
      const { paymentIntentHandler, usdc, publicClient, owner } = await loadFixture(deployPaymentIntentHandlerFixture);

      await expect(paymentIntentHandler.write.localExecuteHook([
        intent,
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      ])).to.be.rejectedWith("InvalidVParameter");

      await expect(paymentIntentHandler.write.localExecuteHook([
        {
          ...intent,
          salt: intent.salt + 1n,
        },
        signature
      ])).to.be.rejectedWith("InvalidSignature");
    });

    it("Should allow operator to execute payment intent", async function () {
      const { owner, feeRecipient, publicClient, paymentIntentHandler, operator, usdc } = await loadFixture(deployPaymentIntentHandlerFixture);

      intent = {
        amount: parseUnits("100", 6),
        feeBps: BigInt(100),
        feeRecipient: feeRecipient.account.address,
        merchant: owner.account.address,
        salt: BigInt(1),
        signerType: SignerType.OPERATOR,
        signer: operator.account.address,
        quantityType: QuantityType.FIXED,
        quantity: BigInt(1),
        nonce: BigInt(1),
      } as PaymentIntentStruct;

      signature = await operator.signTypedData({
        domain: {
          name: "PaymentIntentHandlerV2",
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
            { name: "quantityType", type: "uint8" },
            { name: "quantity", type: "uint256" },
            { name: "signerType", type: "uint8" },
            { name: "signer", type: "address" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "PaymentIntent",
        message: intent,
        account: operator.account.address,
      });

      const OPERATOR_ROLE = keccak256(toUtf8Bytes("OPERATOR_ROLE"));
      await paymentIntentHandler.write.grantRole([OPERATOR_ROLE, operator.account.address]);

      await usdc.write.mint([owner.account.address, intent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, intent.amount]);

      await paymentIntentHandler.write.localExecuteHook([
        intent,
        signature
      ]);

    });
  });
});
