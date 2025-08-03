import { SafeTransferToToken } from "../generated/SafeTransferRouter/SafeTransferRouter";
import { SafeTransfer } from "../generated/schema";

export function handleSafeTransferToToken(event: SafeTransferToToken): void {
  const safeTransferEntity = new SafeTransfer(event.transaction.hash.concatI32(event.logIndex.toI32()).toHex());

  safeTransferEntity.from = event.params.from;
  safeTransferEntity.to = event.params.to;
  safeTransferEntity.amount = event.params.value;
  safeTransferEntity.memo = event.params.memo;
  safeTransferEntity.timestamp = event.block.timestamp;
  safeTransferEntity.txn = event.transaction.hash;

  safeTransferEntity.save();
}
