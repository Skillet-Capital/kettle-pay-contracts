import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, keccak256, parseAbiParameters, parseGwei, parseUnits, zeroAddress } from "viem";
import { randomBytes } from "crypto";
import { getBytes, toUtf8Bytes } from "ethers";

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

function randomBytes32(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function encodeHookData(
  orderId: `0x${string}`,
  intent: PaymentIntentStruct,
  signature: `0x${string}`
) {
  return encodeAbiParameters(
    [
      {
        name: "hookData",
        type: "tuple",
        components: [
          { name: "orderId", type: "bytes32" },
          {
            name: "intent",
            type: "tuple",
            components: [
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
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    [
      {
        orderId: orderId as `0x${string}`,
        intent: {
          amount: BigInt(intent.amount),
          feeBps: BigInt(intent.feeBps),
          feeRecipient: intent.feeRecipient as `0x${string}`,
          merchant: intent.merchant as `0x${string}`,
          salt: BigInt(intent.salt),
          quantityType: intent.quantityType,
          quantity: BigInt(intent.quantity),
          signerType: intent.signerType,
          signer: intent.signer as `0x${string}`,
          nonce: BigInt(intent.nonce),
        },
        signature: signature as `0x${string}`,
      },
    ]
  );
}

describe("PaymentIntentHandler", function () {
  async function deployPaymentIntentHandlerFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, feeRecipient, operator] = await hre.viem.getWalletClients();

    const usdc = await hre.viem.deployContract("MockERC20");
    const weth = await hre.viem.deployContract("MockWeth");
    const token = await hre.viem.deployContract("MockERC20");

    const paymentIntentHandler = await hre.viem.deployContract("PaymentIntentHandler", [usdc.address, owner.account.address]);

    const swapWrapper = await hre.viem.deployContract("SwapWrapper", [weth.address]);
    const mockLiquidityTarget = await hre.viem.deployContract("MockLiquidityTarget");

    const publicClient = await hre.viem.getPublicClient();

    return {
      usdc,
      weth,
      paymentIntentHandler,
      token,
      swapWrapper,
      mockLiquidityTarget,
      owner,
      feeRecipient,
      publicClient,
      operator,
    };
  }

  describe("Local Execution", function () {

    let intent: PaymentIntentStruct;
    let signature: `0x${string}`;
    let orderId: `0x${string}`;

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
          name: "PaymentIntentHandler",
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

      orderId = randomBytes32();
    });

    it("Should deploy the payment intent handler", async function () {
      const { paymentIntentHandler, usdc, owner, publicClient } = await loadFixture(deployPaymentIntentHandlerFixture);

      await usdc.write.mint([owner.account.address, intent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, intent.amount]);

      const hash = await paymentIntentHandler.write.fulfillIntent([
        orderId,
        intent,
        signature
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);

      const currentNonce = await paymentIntentHandler.read.nonces([intent.nonce]);
      expect(currentNonce).to.equal(1n);
    });

    it("Should allow merchant to update the nonce", async function () {
      const { owner, feeRecipient, publicClient, paymentIntentHandler, operator, usdc } = await loadFixture(deployPaymentIntentHandlerFixture);

      // execute the intent
      await usdc.write.mint([owner.account.address, intent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, intent.amount]);

      const hash = await paymentIntentHandler.write.fulfillIntent([
        orderId,
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
          name: "PaymentIntentHandler",
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

      await paymentIntentHandler.write.fulfillIntent([
        randomBytes32(),
        updatedIntent,
        updatedSignature
      ]);

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(2n);

      // test failure because of old nonce
      await expect(paymentIntentHandler.write.fulfillIntent([
        randomBytes32(),
        intent,
        updatedSignature
      ])).to.be.rejectedWith("Using old intent nonce");

      // test failure because of over usage
      await expect(paymentIntentHandler.write.fulfillIntent([
        randomBytes32(),
        updatedIntent,
        updatedSignature
      ])).to.be.rejectedWith("Quantity already used");
    });

    it("Should reject if invalid signature", async function () {
      const { paymentIntentHandler, usdc, publicClient, owner } = await loadFixture(deployPaymentIntentHandlerFixture);

      await expect(paymentIntentHandler.write.fulfillIntent([
        randomBytes32(),
        intent,
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      ])).to.be.rejectedWith("InvalidVParameter");

      await expect(paymentIntentHandler.write.fulfillIntent([
        randomBytes32(),
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
          name: "PaymentIntentHandler",
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

      await paymentIntentHandler.write.fulfillIntent([
        orderId,
        intent,
        signature
      ]);
    });
  });

  describe("Swap Hook Execution", function () {
    let intent: PaymentIntentStruct;
    let signature: `0x${string}`;
    let orderId: `0x${string}`;

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
          name: "PaymentIntentHandler",
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

      orderId = randomBytes32();
    });

    it("Should execute the swap hook directly with encoded data", async function () {
      const { paymentIntentHandler, usdc, publicClient, owner } = await loadFixture(deployPaymentIntentHandlerFixture);

      await usdc.write.mint([owner.account.address, intent.amount]);
      await usdc.write.approve([paymentIntentHandler.address, intent.amount]);

      const hash = await paymentIntentHandler.write.executeSwapHook([
        usdc.address,
        usdc.address,
        intent.amount,
        intent.amount,
        encodeHookData(orderId, intent, signature)
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });

    it("Should execute the swap hook directly with encoded data (simple mint)", async function () {
      const { paymentIntentHandler, usdc, publicClient, owner, mockLiquidityTarget, swapWrapper } = await loadFixture(deployPaymentIntentHandlerFixture);

      const routeParams = {
        tokenIn: usdc.address,
        tokenOut: usdc.address,
        amountInMax: 0n,
        amountOut: intent.amount,
        liquidityTarget: mockLiquidityTarget.address,
        liquidityCalldata: encodeFunctionData({
          abi: mockLiquidityTarget.abi,
          functionName: "mint",
          args: [usdc.address, intent.amount]
        }),
        target: paymentIntentHandler.address,
        structData: encodeHookData(orderId, intent, signature)
      }

      await usdc.write.mint([owner.account.address, intent.amount]);
      await usdc.write.approve([swapWrapper.address, intent.amount]);

      const hash = await swapWrapper.write.executeSwap([
        routeParams
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });

    it("Should execute the swap hook directly with encoded data (simple swap)", async function () {
      const { paymentIntentHandler, usdc, token, publicClient, owner, mockLiquidityTarget, swapWrapper } = await loadFixture(deployPaymentIntentHandlerFixture);

      const routeParams = {
        tokenIn: token.address,
        tokenOut: usdc.address,
        amountInMax: intent.amount,
        amountOut: intent.amount,
        liquidityTarget: mockLiquidityTarget.address,
        liquidityCalldata: encodeFunctionData({
          abi: mockLiquidityTarget.abi,
          functionName: "swap",
          args: [token.address, usdc.address, intent.amount, intent.amount]
        }),
        target: paymentIntentHandler.address,
        structData: encodeHookData(orderId, intent, signature)
      }

      await token.write.mint([owner.account.address, intent.amount]);
      await token.write.approve([swapWrapper.address, intent.amount]);

      const hash = await swapWrapper.write.executeSwap([
        routeParams
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });

    it("Should execute the swap hook directly with encoded data (simple swap with slippage)", async function () {
      const { paymentIntentHandler, usdc, token, publicClient, owner, mockLiquidityTarget, swapWrapper } = await loadFixture(deployPaymentIntentHandlerFixture);

      const routeParams = {
        tokenIn: token.address,
        tokenOut: usdc.address,
        amountInMax: intent.amount,
        amountOut: intent.amount,
        liquidityTarget: mockLiquidityTarget.address,
        liquidityCalldata: encodeFunctionData({
          abi: mockLiquidityTarget.abi,
          functionName: "swapWithSlippage",
          args: [token.address, usdc.address, intent.amount, intent.amount, 100n]
        }),
        target: paymentIntentHandler.address,
        structData: encodeHookData(orderId, intent, signature)
      }

      await token.write.mint([owner.account.address, intent.amount]);
      await token.write.approve([swapWrapper.address, intent.amount]);

      const hash = await swapWrapper.write.executeSwap([
        routeParams
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });

    it("Should execute the swap hook directly with encoded data (simple swap with overflow)", async function () {
      const { paymentIntentHandler, usdc, token, publicClient, owner, mockLiquidityTarget, swapWrapper } = await loadFixture(deployPaymentIntentHandlerFixture);

      const routeParams = {
        tokenIn: token.address,
        tokenOut: usdc.address,
        amountInMax: intent.amount,
        amountOut: intent.amount,
        liquidityTarget: mockLiquidityTarget.address,
        liquidityCalldata: encodeFunctionData({
          abi: mockLiquidityTarget.abi,
          functionName: "swapWithOverflow",
          args: [token.address, usdc.address, intent.amount, intent.amount]
        }),
        target: paymentIntentHandler.address,
        structData: encodeHookData(orderId, intent, signature)
      }

      await token.write.mint([owner.account.address, intent.amount]);
      await token.write.approve([swapWrapper.address, intent.amount]);

      const hash = await swapWrapper.write.executeSwap([
        routeParams
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });

    it("Should execute the swap hook directly with encoded data (native token swap)", async function () {
      const { paymentIntentHandler, usdc, weth, publicClient, owner, mockLiquidityTarget, swapWrapper } = await loadFixture(deployPaymentIntentHandlerFixture);

      const routeParams = {
        tokenIn: zeroAddress,
        tokenOut: usdc.address,
        amountInMax: intent.amount,
        amountOut: intent.amount,
        liquidityTarget: mockLiquidityTarget.address,
        liquidityCalldata: encodeFunctionData({
          abi: mockLiquidityTarget.abi,
          functionName: "swapWithSlippage",
          args: [weth.address, usdc.address, intent.amount, intent.amount, 100n]
        }),
        target: paymentIntentHandler.address,
        structData: encodeHookData(orderId, intent, signature)
      }

      // await token.write.mint([owner.account.address, intent.amount]);
      // await token.write.approve([swapWrapper.address, intent.amount]);

      const hash = await swapWrapper.write.executeSwap([
        routeParams
      ], { value: intent.amount });

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });
  });
});
