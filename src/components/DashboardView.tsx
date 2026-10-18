import React from "react";
import type { SiteConfig, SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import DragonsHomeSection from "./DragonsHomeSection";

interface DashboardViewProps {
  isHomeActive: boolean;
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  siteConfig?: SiteConfig | null;
  onSubscribeSuccess: (node: SubscribedNode, amount: number) => void;
  onClaimSuccess: (amount: number, balance: number, subId: string, lastClaimedDate: string, status: "active" | "expired", withdrawableBalance?: number, daysFed?: number) => void;
  onProfileUpdate: (profile: UserProfile) => void;
  onNavigateToCollection: () => void;
  onNavigateToHistory: () => void;
  onNavigateToAccount: () => void;
  onNavigateToDeposit: () => void;
  onNavigateToWithdraw: () => void;
  onSignOut: () => void;
}

export default function DashboardView(props: DashboardViewProps) {
  const { isHomeActive, ...dragonProps } = props;
  return (
    <div className="w-full pb-16">
      <DragonsHomeSection {...dragonProps} isActive={isHomeActive} />
    </div>
  );
}
