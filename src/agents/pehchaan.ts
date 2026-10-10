// SPDX-License-Identifier: Apache-2.0
// pehchaan.ts — Agent 1: Identity ("pehchaan" = identity).
//
// Issues and verifies signed Rider identities for youth. KYC-lite: the phone
// number is hashed (sha256) and never stored raw. Duplicate phone → returns
// the existing identity instead of minting a second (Sybil resistance).
// G1: first 100 identity queries/month are free — youth onboarding is
// effectively free at pilot scale.
import { sha256Hex } from "../lib/crypto.js";
import { RiderIdentity } from "../lib/rider.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export interface YouthProfile {
  phoneHash: string;
  displayName: string;
  agentId: string;
  keyId: string;
  publicPem: string;
  issuedAt: string;
}

export class Pehchaan extends MeshAgent {
  private profiles = new Map<string, YouthProfile>(); // phoneHash -> profile
  private identities = new Map<string, RiderIdentity>(); // agentId -> identity

  constructor(ctx: MeshContext) {
    super("pehchaan", "Pehchaan · Identity", ctx);
  }

  /**
   * Onboard a youth: phone + display name. In production `livenessOk` comes
   * from the client liveness check; the demo passes it explicitly.
   */
  async onboard(phone: string, displayName: string, livenessOk: boolean): Promise<{
    profile: YouthProfile;
    identity: RiderIdentity;
    duplicate: boolean;
  }> {
    if (!livenessOk) throw new Error("pehchaan: liveness check failed — identity refused");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) throw new Error("pehchaan: invalid phone number");
    const phoneHash = sha256Hex(`rozgar-phone:${digits}`);

    const existing = this.profiles.get(phoneHash);
    if (existing) {
      const identity = this.identities.get(existing.agentId)!;
      return { profile: existing, identity, duplicate: true };
    }

    // G1 toll — free inside the monthly quota; charged (and receipted) regardless.
    this.toll("G1", 0, `identity issue for ${displayName} (quota-tracked)`);

    const identity = await this.ctx.rider.issue(displayName);
    const profile: YouthProfile = {
      phoneHash,
      displayName,
      agentId: identity.agentId,
      keyId: identity.keyId,
      publicPem: identity.publicPem,
      issuedAt: identity.issuedAt,
    };
    this.profiles.set(phoneHash, profile);
    this.identities.set(identity.agentId, identity);

    this.receipt("identity-issued", {
      agentId: identity.agentId,
      displayName,
      phoneHash: phoneHash.slice(0, 16) + "…",
      keyId: identity.keyId,
    });
    return { profile, identity, duplicate: false };
  }

  profileOf(agentIdOrKeyId: string): YouthProfile | undefined {
    return [...this.profiles.values()].find(
      (p) => p.agentId === agentIdOrKeyId || p.keyId === agentIdOrKeyId
    );
  }

  async verifyIdentity(riderJwt: string): Promise<boolean> {
    return this.verifyCounterparty(riderJwt);
  }

  identityCount(): number {
    return this.profiles.size;
  }
}
