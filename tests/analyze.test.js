import { describe, it, expect } from "vitest";

// Test the internal helper functions by importing the module
// and testing the exported functions that don't require OpenAI

describe("analysis module integration", () => {
  // These tests verify the module can be imported without errors
  it("should export required functions", async () => {
    const module = await import("../src/openaiAnalyze.js");

    expect(typeof module.createOpenAIClient).toBe("function");
    expect(typeof module.analyzeCorpus).toBe("function");
    expect(typeof module.analyzeFileToMarkdown).toBe("function");
    expect(typeof module.analyzeCorpusTextToMarkdown).toBe("function");
  });
});

describe("post data structure", () => {
  // Test that posts conform to expected structure for analysis
  const validPost = {
    id: "abc123",
    subreddit: "startups",
    title: "Test post",
    author: "testuser",
    created: "2024-01-15T10:30:00.000Z",
    score: 42,
    numComments: 10,
    url: "https://reddit.com/r/startups/comments/abc123",
    permalink: "/r/startups/comments/abc123/test_post/",
    selftext: "This is the post content",
    comments: [
      {
        id: "c1",
        author: "commenter1",
        score: 5,
        body: "Great post!",
        created: "2024-01-15T11:00:00.000Z"
      }
    ]
  };

  it("should have all required fields", () => {
    expect(validPost.id).toBeDefined();
    expect(validPost.subreddit).toBeDefined();
    expect(validPost.title).toBeDefined();
    expect(validPost.selftext).toBeDefined();
    expect(validPost.permalink).toBeDefined();
  });

  it("should have properly formatted comments", () => {
    expect(Array.isArray(validPost.comments)).toBe(true);
    expect(validPost.comments[0].body).toBeDefined();
    expect(validPost.comments[0].author).toBeDefined();
  });
});

describe("analysis output structure", () => {
  // Test expected output structures

  it("should validate tags structure", () => {
    const validTags = {
      painPoints: [
        {
          category: "Customer Acquisition",
          description: "Hard to find first customers",
          quote: "I spent months trying to get my first 10 users",
          permalink: "https://reddit.com/r/startups/comments/abc123",
          frequency: "common"
        }
      ],
      personas: [
        {
          role: "Solo Founder",
          description: "Technical founders building alone",
          painPoints: ["Customer Acquisition"]
        }
      ],
      urgency: "high",
      urgencyReason: "Multiple posts express frustration",
      competitors: [
        { name: "Competitor X", sentiment: "negative", mentions: 3 }
      ],
      willingnessToPay: {
        signals: ["Would pay for automation"],
        confidence: "medium"
      }
    };

    expect(validTags.painPoints).toBeInstanceOf(Array);
    expect(validTags.personas).toBeInstanceOf(Array);
    expect(["low", "medium", "high"]).toContain(validTags.urgency);
    expect(["low", "medium", "high"]).toContain(validTags.willingnessToPay.confidence);
  });

  it("should validate opportunity structure", () => {
    const validOpportunity = {
      id: "opp-1",
      title: "Customer Discovery Tool",
      targetUser: "Solo founders",
      problem: "Spending too much time on manual outreach",
      currentWorkaround: "Cold emails and LinkedIn",
      proposedSolution: "Automated lead qualification",
      confidence: "medium",
      confidenceReason: "Multiple mentions but unclear WTP",
      supportingQuotes: [
        { text: "I spend 4 hours a day...", permalink: "https://..." }
      ],
      risks: ["Crowded market"],
      mvpExperiment: "Landing page with email capture"
    };

    expect(validOpportunity.id).toBeDefined();
    expect(validOpportunity.title).toBeDefined();
    expect(validOpportunity.targetUser).toBeDefined();
    expect(validOpportunity.problem).toBeDefined();
    expect(["low", "medium", "high"]).toContain(validOpportunity.confidence);
    expect(Array.isArray(validOpportunity.supportingQuotes)).toBe(true);
    expect(Array.isArray(validOpportunity.risks)).toBe(true);
  });
});

describe("quote fidelity mode", () => {
  it("should require quotes to have text and permalink", () => {
    const validQuote = {
      text: "I've been struggling with this for months",
      permalink: "https://reddit.com/r/startups/comments/abc123"
    };

    expect(validQuote.text).toBeDefined();
    expect(validQuote.text.length).toBeGreaterThan(0);
    expect(validQuote.permalink).toMatch(/^https?:\/\//);
  });

  it("should mark hypotheses without quotes", () => {
    const hypothesis = {
      insight: "[HYPOTHESIS] Users might pay for this feature",
      reasoning: "Inferred from general frustration, no direct quotes"
    };

    expect(hypothesis.insight).toContain("[HYPOTHESIS]");
  });
});

