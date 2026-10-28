import React from "react";
import type { SiteConfig, SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import DragonsHomeSection from "./DragonsHomeSection";

interface DashboardViewProps {
  isHomeActive: boolean;
  navCompact?: boolean;
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  siteConfig?: SiteConfig | null;
  onSubscribeSuccess: (node: SubscribedNode, amount: number) => void;
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
    <div className="w-full pb-28">
      <DragonsHomeSection {...dragonProps} isActive={isHomeActive} />
    </div>
  );
}
