import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { PaymentIntentSuccess } from "../generated/PaymentIntentHandler/PaymentIntentHandler";
import { IntentFulfillment } from "../generated/schema";

export function formatSalt(salt: BigInt): Bytes {
  // Convert BigInt to a hexadecimal string
  let hexString = salt.toHexString().replace('0x', '');
  let paddedHexString = '0x' + hexString.padStart(64, '0');

  // Convert the padded string to Bytes
  return Bytes.fromHexString(paddedHexString);
}

export function handlePaymentIntentSuccess(event: PaymentIntentSuccess): void {
  const intentFulfillment = new IntentFulfillment(event.transaction.hash.concatI32(event.logIndex.toI32()).toHex());

  intentFulfillment.amount = event.params.intent.amount;
  intentFulfillment.orderId = event.params.orderId;
  intentFulfillment.salt = formatSalt(event.params.intent.salt);
  intentFulfillment.merchant = event.params.intent.merchant;
  intentFulfillment.netAmount = event.params.netPayable;
  intentFulfillment.feeAmount = event.params.netFee.plus(event.params.feeExecuted);
  intentFulfillment.timestamp = event.block.timestamp;
  intentFulfillment.txn = event.transaction.hash;

  intentFulfillment.save();
}
