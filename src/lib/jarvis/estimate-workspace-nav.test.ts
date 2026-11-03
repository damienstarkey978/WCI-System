import { describe, expect, it } from "vitest";

import {
  extractEstimateWorkspaceHref,
  findEstimateWorkspaceHrefInMessages,
  isAsyncDraftFailureMessage,
  isWaitingOnAsyncDraft,
} from "./estimate-workspace-nav";

describe("extractEstimateWorkspaceHref", () => {
  it("reads the workspace path", () => {
    expect(
      extractEstimateWorkspaceHref("Review it at /leads/estimates/cmvwg65is0007gsjse3hf0tda then convert."),
    ).toBe("/leads/estimates/cmvwg65is0007gsjse3hf0tda");
  });

  it("reads Drafted estimate (id: …) when the path is missing", () => {
    expect(extractEstimateWorkspaceHref('Drafted estimate "Robin Hood" (id: cmabc123def456ghi789jkl) with line items')).toBe(
      "/leads/estimates/cmabc123def456ghi789jkl",
    );
  });

  it("returns null for apology / notes paragraphs", () => {
    expect(
      extractEstimateWorkspaceHref(
        "Sorry for the earlier message — I described work I hadn't done. Nothing had been created at that point.",
      ),
    ).toBeNull();
  });
});

describe("findEstimateWorkspaceHrefInMessages", () => {
  it("finds a link in an earlier assistant turn when the latest bubble is an apology", () => {
    const href = findEstimateWorkspaceHrefInMessages([
      { role: "USER", content: "draft from notes" },
      {
        role: "ASSISTANT",
        content: "Drafted estimate \"Robin Hood\" — review at /leads/estimates/cmestimate1234567890abcd.",
      },
      {
        role: "ASSISTANT",
        content: "Sorry for the earlier message — I described work I hadn't done.",
      },
    ]);
    expect(href).toBe("/leads/estimates/cmestimate1234567890abcd");
  });
});

describe("isWaitingOnAsyncDraft", () => {
  it("detects the queued ack", () => {
    expect(
      isWaitingOnAsyncDraft([
        { role: "ASSISTANT", content: "Queued that up — drafting the estimate. I'll post the result right here once it's done." },
      ]),
    ).toBe(true);
  });

  it("clears once a later failure posts", () => {
    expect(
      isWaitingOnAsyncDraft([
        { role: "ASSISTANT", content: "Queued that up — I'll post the result right here." },
        { role: "ASSISTANT", content: "I wasn't able to finish drafting that estimate: timed out" },
      ]),
    ).toBe(false);
  });
});

describe("isAsyncDraftFailureMessage", () => {
  it("matches worker failure posts", () => {
    expect(isAsyncDraftFailureMessage("I wasn't able to finish drafting that estimate: boom")).toBe(true);
  });
});
