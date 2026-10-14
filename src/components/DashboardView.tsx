import React from "react";
import type { SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import DragonsHomeSection from "./DragonsHomeSection";

interface DashboardViewProps {
  isHomeActive: boolean;
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onSubscribeSuccess: (node: SubscribedNode, amount: number) => void;
  onClaimSuccess: (amount: number, balance: number, subId: string, lastClaimedDate: string, status: "active" | "expired") => void;
  onProfileUpdate: (profile: UserProfile) => void;
  onNavigateToCollection: () => void;
  onNavigateToHistory: () => void;
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
