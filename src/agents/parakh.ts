// SPDX-License-Identifier: Apache-2.0
// parakh.ts — Agent 2: Assessment ("parakh" = test/assay).
//
// Runs CuNi-proven skill micro-tests and mints signed skill receipts.
// The scoring program passes the G5 exactness gate (byte-identical across
// two implementations) before ANY run — a tampered client can't fake a pass.
// Test items are drawn per-session from a bank; the proof hash binds the
// item set, so swapping items after the fact invalidates the receipt.
import { newId, sha256Hex } from "../lib/crypto.js";
import { TestItem, scoreTestA } from "../cuni/scoring-a.js";
import { provenScore } from "../cuni/gate.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export interface SkillTrack {
  id: string;
  title: string;
  minutes: number;
  passScore: number;
}

export const SKILL_TRACKS: SkillTrack[] = [
  { id: "data-entry-l1", title: "Data Entry — Level 1", minutes: 15, passScore: 60 },
  { id: "hindi-typing-l1", title: "Hindi Typing — Level 1", minutes: 10, passScore: 60 },
  { id: "python-basics-l1", title: "Python Basics — Level 1", minutes: 15, passScore: 60 },
];

// Item bank: data-entry-l1. Each item has a stable id and an expected answer.
const ITEM_BANK: Record<string, TestItem[]> = {
  "data-entry-l1": [
    { id: "de1", prompt: "Type the number: forty-two thousand, three hundred", expected: "42300" },
    { id: "de2", prompt: "Type the date: 15 August 2026 (DD-MM-YYYY)", expected: "15-08-2026" },
    { id: "de3", prompt: "Type the amount: two thousand rupees (digits only)", expected: "2000" },
    { id: "de4", prompt: "Type the name exactly: Aisha Sharma", expected: "Aisha Sharma" },
    { id: "de5", prompt: "Type the phone: nine eight six, triple nine, zero one two three", expected: "9869990123" },
    { id: "de6", prompt: "Type the email: aisha.sharma@example.in", expected: "aisha.sharma@example.in" },
    { id: "de7", prompt: "Type the IFSC-style code: SBIN0060231", expected: "SBIN0060231" },
    { id: "de8", prompt: "Type the quantity: one dozen", expected: "12" },
    { id: "de9", prompt: "Type the city PIN: Lucknow 226001", expected: "226001" },
    { id: "de10", prompt: "Type the total: 450 + 550 (digits only)", expected: "1000" },
  ],
  "hindi-typing-l1": [
    { id: "ht1", prompt: "Type in Devanagari: namaste", expected: "नमस्ते" },
    { id: "ht2", prompt: "Type in Devanagari: dhanyavaad", expected: "धन्यवाद" },
    { id: "ht3", prompt: "Type in Devanagari: rozgar", expected: "रोज़गार" },
    { id: "ht4", prompt: "Type in Devanagari: kaam", expected: "काम" },
    { id: "ht5", prompt: "Type in Devanagari: paisa", expected: "पैसा" },
  ],
  "python-basics-l1": [
    { id: "py1", prompt: "What does print(2 + 3) output?", expected: "5" },
    { id: "py2", prompt: "What is len(\"rozgar\")?", expected: "6" },
    { id: "py3", prompt: "Type the keyword that defines a function", expected: "def" },
    { id: "py4", prompt: "What does 7 // 2 evaluate to?", expected: "3" },
    { id: "py5", prompt: "Type the boolean value meaning true", expected: "True" },
  ],
};

export interface TestSession {
  sessionId: string;
  trackId: string;
  workerKeyId: string;
  items: TestItem[];
  startedAt: string;
}

export interface SkillReceiptPayload {
  receiptId: string;
  skill: string;
  level: string;
  score100: number;
  passed: boolean;
  proofHash: string;
  workerKeyId: string;
  sessionId: string;
  issuedAt: string;
}

export class Parakh extends MeshAgent {
  private sessions = new Map<string, TestSession>();

  constructor(ctx: MeshContext) {
    super("parakh", "Parakh · Assessment", ctx);
  }

  /** Start a test session: items drawn per-session from the bank. */
  startTest(trackId: string, workerKeyId: string): TestSession {
    const track = SKILL_TRACKS.find((t) => t.id === trackId);
    if (!track) throw new Error(`parakh: unknown skill track ${trackId}`);
    const bank = ITEM_BANK[trackId] ?? [];
    if (bank.length === 0) throw new Error(`parakh: empty item bank for ${trackId}`);
    // Deterministic per-session draw (seeded by session id) — reproducible.
    const sessionId = newId("tsess");
    const seed = parseInt(sha256Hex(sessionId).slice(0, 8), 16);
    const items = [...bank].sort(
      (a, b) =>
        (parseInt(sha256Hex(seed + a.id).slice(0, 8), 16) % 997) -
        (parseInt(sha256Hex(seed + b.id).slice(0, 8), 16) % 997)
    );
    const session: TestSession = {
      sessionId,
      trackId,
      workerKeyId,
      items,
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /** Grade a session. The G5 gate runs first — divergence refuses the run. */
  grade(sessionId: string, answers: Record<string, string>): SkillReceiptPayload {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("parakh: unknown test session");
    const track = SKILL_TRACKS.find((t) => t.id === session.trackId)!;

    // G5 CuNi verification — $0.10/check, receipted.
    this.toll("G5", 0, `exactness verification for ${session.trackId}`);

    const { correct, total, score100, proofHash } = provenScore(session.items, answers);
    void scoreTestA; // implementation A is exercised inside provenScore's corpus
    const receiptId = newId("skill");
    const payload: SkillReceiptPayload = {
      receiptId,
      skill: session.trackId,
      level: "L1",
      score100,
      passed: score100 >= track.passScore,
      proofHash,
      workerKeyId: session.workerKeyId,
      sessionId,
      issuedAt: new Date().toISOString(),
    };
    this.receipt("skill-receipt", { ...payload, correct, total });
    this.sessions.delete(sessionId);
    return payload;
  }

  tracks(): SkillTrack[] {
    return SKILL_TRACKS;
  }
}
