import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { encodeFunctionData, encodePacked, keccak256, pad, parseUnits, zeroAddress } from "viem";
import { toUtf8Bytes } from "ethers";
import { signPaymentIntent } from "./signature";
import { encodeHookData, encodeOrderData } from "./encode";
import { randomBytes32 } from "./utils";
import { PaymentIntentStruct, SignerType, QuantityType } from "./types";

describe("PaymentIntentHandler", function () {
  async function deployPaymentIntentHandlerFixture() {
    const [owner, feeRecipient, operator, relayer] = await hre.viem.getWalletClients();

    // Deploy currencies
    const usdc = await hre.viem.deployContract("MockERC20");
    const token = await hre.viem.deployContract("MockERC20");
    const weth = await hre.viem.deployContract("MockWeth");

    // Deploy Swap Wrapper and Mock Uniswap (liquidity target)
    const swapWrapper = await hre.viem.deployContract("SwapWrapper", [weth.address]);
    const mockLiquidityTarget = await hre.viem.deployContract("MockLiquidityTarget");

    // Deploy CCTP Mint Hook Wrapper and Mock Message Transmitter
    const mockMessageTransmitter = await hre.viem.deployContract("MockMessageTransmitter", [usdc.address]);
    const cctpMintHookWrapper = await hre.viem.deployContract("CCTPMintHookWrapper", [usdc.address, mockMessageTransmitter.address]);

    // Grant RELAYER_ROLE to relayer
    const RELAYER_ROLE = keccak256(toUtf8Bytes("RELAYER_ROLE"));
    await cctpMintHookWrapper.write.grantRole([RELAYER_ROLE, relayer.account.address]);

    // Deploy Payment Intent Handler
    const paymentIntentHandler = await hre.viem.deployContract("PaymentIntentHandler", [usdc.address, cctpMintHookWrapper.address]);

    const OPERATOR_ROLE = keccak256(toUtf8Bytes("OPERATOR_ROLE"));
    await paymentIntentHandler.write.grantRole([OPERATOR_ROLE, operator.account.address]);

    // Get public client
    const publicClient = await hre.viem.getPublicClient();

    return {
      publicClient,
      owner,
      feeRecipient,
      operator,
      relayer,
      usdc,
      token,
      weth,
      paymentIntentHandler,
      swapWrapper,
      mockLiquidityTarget,
      mockMessageTransmitter,
      cctpMintHookWrapper,
    };
  }

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

    signature = await signPaymentIntent(intent, owner, publicClient, paymentIntentHandler.address);

    orderId = randomBytes32();
  });

  describe("Local Execution", function () {

    it("Should fulfill the payment intent and update state", async function () {
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
        ...intent,
        quantity: BigInt(2),
        nonce: BigInt(2),
      } as PaymentIntentStruct;

      const updatedSignature = await signPaymentIntent(updatedIntent, owner, publicClient, paymentIntentHandler.address);

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
      const { paymentIntentHandler } = await loadFixture(deployPaymentIntentHandlerFixture);

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
      const { owner, publicClient, paymentIntentHandler, operator, usdc } = await loadFixture(deployPaymentIntentHandlerFixture);

      intent = {
        ...intent,
        signerType: SignerType.OPERATOR,
        signer: operator.account.address,
      } as PaymentIntentStruct;

      signature = await signPaymentIntent(intent, operator, publicClient, paymentIntentHandler.address);

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

      const hash = await swapWrapper.write.executeSwap([
        routeParams
      ], { value: intent.amount });

      await publicClient.waitForTransactionReceipt({ hash });

      const usage = await paymentIntentHandler.read.usages([intent.salt]);
      expect(usage).to.equal(1n);

      const orderIdUsed = await paymentIntentHandler.read.orderIds([orderId]);
      expect(orderIdUsed).to.equal(true);
    });

    it("Should execute the swap hook directly with encoded data (native token swap with overflow)", async function () {
      const { paymentIntentHandler, usdc, weth, publicClient, owner, mockLiquidityTarget, swapWrapper } = await loadFixture(deployPaymentIntentHandlerFixture);

      const routeParams = {
        tokenIn: zeroAddress,
        tokenOut: usdc.address,
        amountInMax: intent.amount,
        amountOut: intent.amount,
        liquidityTarget: mockLiquidityTarget.address,
        liquidityCalldata: encodeFunctionData({
          abi: mockLiquidityTarget.abi,
          functionName: "swapWithOverflow",
          args: [weth.address, usdc.address, intent.amount, intent.amount]
        }),
        target: paymentIntentHandler.address,
        structData: encodeHookData(orderId, intent, signature)
      }

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

  describe("CCTP Hook Execution", function () {
    it("should construct a burn message", async function () {
      const { paymentIntentHandler, usdc, cctpMintHookWrapper, publicClient } = await loadFixture(deployPaymentIntentHandlerFixture);

      const intentHash = await paymentIntentHandler.read.hashPaymentIntent([intent]);
      const hookData = encodeOrderData(paymentIntentHandler.address, orderId, intentHash);

      const messageBody = encodePacked(
        [
          "uint32", // version
          "bytes32", // burnToken
          "bytes32", // mintRecipient
          "uint256", // amount
          "bytes32", // messageSender
          "uint256", // maxFee
          "uint256", // feeExecuted
          "uint256", // expirationBlock
          "bytes",
        ],
        [
          1,
          pad(usdc.address, { size: 32 }) as `0x${string}`,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          intent.amount,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0n,
          0n,
          BigInt(intent.amount) * BigInt(1) / BigInt(10000),
          hookData
        ]
      );

      const message = encodePacked(
        [
          "uint32", // version
          "uint32", // sourceDomain
          "uint32", // destinationDomain
          "bytes32", // nonce
          "bytes32", // sender
          "bytes32", // recipient
          "bytes32", // destinationCaller
          "uint32", // minFinalityThreshold
          "uint32", // finalityThresholdExecuted
          "bytes", // messageBody
        ],
        [
          1,
          1,
          1,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0,
          0,
          messageBody
        ]
      )

      const hash = await cctpMintHookWrapper.write.relayIntent([
        message,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        intent,
        signature
      ]) 

      await publicClient.waitForTransactionReceipt({ hash });
    });

    it("should construct a burn message and fail because of mismatching hash", async function () {
      const { paymentIntentHandler, usdc, cctpMintHookWrapper, publicClient } = await loadFixture(deployPaymentIntentHandlerFixture);

      const intentHash = await paymentIntentHandler.read.hashPaymentIntent([intent]);
      const hookData = encodeOrderData(paymentIntentHandler.address, orderId, randomBytes32());

      const messageBody = encodePacked(
        [
          "uint32", // version
          "bytes32", // burnToken
          "bytes32", // mintRecipient
          "uint256", // amount
          "bytes32", // messageSender
          "uint256", // maxFee
          "uint256", // feeExecuted
          "uint256", // expirationBlock
          "bytes",
        ],
        [
          1,
          pad(usdc.address, { size: 32 }) as `0x${string}`,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          intent.amount,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0n,
          0n,
          BigInt(intent.amount) * BigInt(1) / BigInt(10000),
          hookData
        ]
      );

      const message = encodePacked(
        [
          "uint32", // version
          "uint32", // sourceDomain
          "uint32", // destinationDomain
          "bytes32", // nonce
          "bytes32", // sender
          "bytes32", // recipient
          "bytes32", // destinationCaller
          "uint32", // minFinalityThreshold
          "uint32", // finalityThresholdExecuted
          "bytes", // messageBody
        ],
        [
          1,
          1,
          1,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0,
          0,
          messageBody
        ]
      )

      await expect(cctpMintHookWrapper.write.relayIntent([
        message,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        intent,
        signature
      ])).to.be.rejectedWith("Invalid intent hash");
    });

    it("should save the relay", async function () {
      const { paymentIntentHandler, usdc, cctpMintHookWrapper, publicClient, feeRecipient } = await loadFixture(deployPaymentIntentHandlerFixture);

      const intentHash = await paymentIntentHandler.read.hashPaymentIntent([intent]);
      const hookData = encodeOrderData(paymentIntentHandler.address, orderId, randomBytes32());
      const totalFee = BigInt(intent.amount) * BigInt(1) / BigInt(10000);

      const messageBody = encodePacked(
        [
          "uint32", // version
          "bytes32", // burnToken
          "bytes32", // mintRecipient
          "uint256", // amount
          "bytes32", // messageSender
          "uint256", // maxFee
          "uint256", // feeExecuted
          "uint256", // expirationBlock
          "bytes",
        ],
        [
          1,
          pad(usdc.address, { size: 32 }) as `0x${string}`,
          pad(cctpMintHookWrapper.address, { size: 32 }) as `0x${string}`,
          intent.amount,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0n,
          totalFee,
          totalFee,
          hookData
        ]
      );

      const message = encodePacked(
        [
          "uint32", // version
          "uint32", // sourceDomain
          "uint32", // destinationDomain
          "bytes32", // nonce
          "bytes32", // sender
          "bytes32", // recipient
          "bytes32", // destinationCaller
          "uint32", // minFinalityThreshold
          "uint32", // finalityThresholdExecuted
          "bytes", // messageBody
        ],
        [
          1,
          1,
          1,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0,
          0,
          messageBody
        ]
      )

      const hash = await cctpMintHookWrapper.write.saveRelay([
        message,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        feeRecipient.account.address
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const balance = await usdc.read.balanceOf([feeRecipient.account.address]);
      expect(balance).to.equal(intent.amount - BigInt(intent.amount) * BigInt(1) / BigInt(10000));
    })
  });
});
