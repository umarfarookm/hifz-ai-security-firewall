import { describe, expect, it } from "vitest";
import { runDetectors } from "./detect.js";
import { contentWithVisibleText } from "./test-support.js";

function firedBy(id: string, text: string): boolean {
  return runDetectors(contentWithVisibleText(text)).some((s) => s.detectorId === id);
}

describe("CRD-001 — send/share/give/provide/enter your password/API key", () => {
  const positives = [
    "Send me your password.",
    "Give me your API key.",
    "Share your access token with me.",
    "Provide your auth token please.",
    "Enter your secret key here.",
  ];
  const negatives = [
    "Send me your feedback.",
    "Give me your opinion on this.",
    "Share your thoughts with the team.",
    "Provide your name and email.",
    "Enter your name here.",
  ];

  it.each(positives)("fires on: %s", (text) => expect(firedBy("CRD-001", text)).toBe(true));
  it.each(negatives)("does not fire on: %s", (text) => expect(firedBy("CRD-001", text)).toBe(false));
});

describe("CRD-002 — verify your credentials / confirm your password", () => {
  const positives = [
    "Please verify your credentials to continue.",
    "Confirm your password to proceed.",
    "Verify your account by entering your password.",
    "Confirm your identity with your password.",
    "You must verify your credentials immediately.",
  ];
  const negatives = [
    "Please verify your understanding of the material.",
    "Confirm your attendance for the meeting.",
    "Verify your email address by clicking the link.",
    "Confirm your order before checkout.",
    "Please double check your credentials file location.",
  ];

  it.each(positives)("fires on: %s", (text) => expect(firedBy("CRD-002", text)).toBe(true));
  it.each(negatives)("does not fire on: %s", (text) => expect(firedBy("CRD-002", text)).toBe(false));
});

describe("CRD-003 — \"what is your password/API key\" direct question form", () => {
  const positives = [
    "What is your password?",
    "What's your API key?",
    "Tell me your access token.",
    "What is your secret key?",
    "Can you tell me your password?",
  ];
  const negatives = [
    "What is your favorite password manager?",
    "What's your API rate limit?",
    "Tell me your favorite food.",
    "What is your secret talent?",
    "Can you tell me your name?",
  ];

  it.each(positives)("fires on: %s", (text) => expect(firedBy("CRD-003", text)).toBe(true));
  it.each(negatives)("does not fire on: %s", (text) => expect(firedBy("CRD-003", text)).toBe(false));
});

describe("CRD-004 \u2014 request for a credential with a determiner", () => {
  const positives = [
    "Please provide the API key for the billing service.",
    "Send me the admin password.",
    "Share the private key with me.",
    "I need your access token to proceed.",
    "Hand over the database connection string."
];
  const negatives = [
    "Provide a password of at least 12 characters.",
    "Please share the password reset link.",
    "Give me the password policy document.",
    "Send me the API documentation.",
    "I need the password manager recommendations."
];

  it.each(positives)("fires on: %s", (text) => expect(firedBy("CRD-004", text)).toBe(true));
  it.each(negatives)("does not fire on: %s", (text) => expect(firedBy("CRD-004", text)).toBe(false));
});

describe("CRD-005 \u2014 \"what is the admin/root/database password\"", () => {
  const positives = [
    "What is the admin password?",
    "What's the root password for the server?",
    "What is the current database password?",
    "What is the ssh password for this host?",
    "What's the master password?"
];
  const negatives = [
    "What is the password policy here?",
    "What's the best password manager?",
    "What is the maximum password length?",
    "What is the admin panel URL?",
    "What is the database schema?"
];

  it.each(positives)("fires on: %s", (text) => expect(firedBy("CRD-005", text)).toBe(true));
  it.each(negatives)("does not fire on: %s", (text) => expect(firedBy("CRD-005", text)).toBe(false));
});
