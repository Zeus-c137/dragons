/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Phone, Wallet, CheckCircle2 } from "lucide-react";
import { notify } from "../lib/notify";
import { Button } from "./ui/button";
import { UserProfile } from "../types";

interface BindAccountViewProps {
  userProfile: UserProfile;
  onProfileUpdate: (newProfile: UserProfile) => void;
}

export default function BindAccountView({ userProfile, onProfileUpdate }: BindAccountViewProps) {
  const [username, setUsername] = useState(userProfile.username || "");
  const [operator, setOperator] = useState<"MTN" | "Airtel">((userProfile.operator as "MTN" | "Airtel") || "MTN");
  const [usdtAddress, setUsdtAddress] = useState(userProfile.usdtAddress || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [withdrawalPhone, setWithdrawalPhone] = useState(userProfile.phone || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [successUpdate, setSuccessUpdate] = useState(false);

  useEffect(() => {
    setUsername(userProfile.username || "");
    setOperator((userProfile.operator as "MTN" | "Airtel") || "MTN");
    setUsdtAddress(userProfile.usdtAddress || "");
    setWithdrawalPhone(userProfile.phone || "");
  }, [userProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessUpdate(false);

    if (newPassword && newPassword !== confirmPassword) {
      notify("error", "Passwords do not match.");
      return;
    }

    if (!/^\d{9,10}$/.test(withdrawalPhone)) {
      notify("error", "Withdrawal phone number must be 9 or 10 digits.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: userProfile.id,
          username,
          operator,
          customPhone: withdrawalPhone,
          usdtAddress,
          newPassword: newPassword || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Profile ledger update failed.");
      }

      onProfileUpdate(data.profile);
      setSuccessUpdate(true);
      notify("success", "Account preferences updated successfully.");
      if (newPassword) {
        setNewPassword("");
        setConfirmPassword("");
        notify("info", "Password saved.");
      }
    } catch (err: any) {
      notify("error", err.message || "Failed to edit user settings.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      <div className="space-y-0.5">
        <h1 className="font-display font-black text-xl text-[var(--theme-text)] tracking-tight">Account details</h1>
        <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65">Manage your payout destination and sign-in security.</p>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Username / Invite Code</label>
          <input
            type="text"
            required
            value={username}
            disabled
            readOnly
            className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/40 border border-[var(--theme-card-border)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans font-medium opacity-60 cursor-not-allowed select-text"
            aria-describedby="username-invite-note"
          />
          <p id="username-invite-note" className="text-[11px] text-[var(--theme-text)] opacity-50">
            This is your permanent username and invite code.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Phone Number</label>
          <div className="relative">
            <Phone className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-50 absolute left-3 top-3.5" />
            <input
              type="tel"
              required
              autoComplete="tel"
              value={withdrawalPhone}
              disabled={true} readOnly
              onChange={(e) => setWithdrawalPhone(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans opacity-70 select-text"
              placeholder="+25677..."
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">USDT Wallet Address (Optional)</label>
          <div className="relative">
            <Wallet className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-50 absolute left-3 top-3.5" />
            <input
              type="text"
              autoComplete="off"
              value={usdtAddress}
              onChange={(e) => setUsdtAddress(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
              placeholder="T..."
            />
          </div>
        </div>

        <div className="space-y-1 pt-2 border-t border-[var(--theme-card-border)]">
          <label className="text-[12px] font-sans uppercase text-[var(--theme-text)] opacity-70 font-bold block">Update Password (Optional)</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
            placeholder="New password"
          />
        </div>

        {newPassword && (
          <div className="space-y-1">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 input-frosted bg-[var(--theme-bg)]/60 backdrop-blur-xl border border-[var(--theme-card-border)] focus:border-[var(--theme-primary)] text-[var(--theme-text)] text-xs rounded-[var(--theme-radius)] outline-none font-sans transition-colors select-text"
              placeholder="Confirm new password"
            />
          </div>
        )}

        {successUpdate && (
          <div className="text-center text-[11px] text-emerald-400 font-sans py-1 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Account settings saved.</span>
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          type="submit"
          loading={isSavingProfile}
          disabled={isSavingProfile}
          className="w-full"
        >
          Save Account Data
        </Button>
      </form>
    </div>
  );
}
