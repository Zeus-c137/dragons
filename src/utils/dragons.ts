import type { SubscriptionItem } from "../types";

export function isDragonEggProduct(item: SubscriptionItem): boolean {
  return Boolean(item.eggImageUrl?.trim() && item.dragonImageUrl?.trim());
}
