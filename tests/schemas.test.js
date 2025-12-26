import { describe, it, expect } from "vitest";
import {
  TagsSchema,
  OpportunitiesSchema,
  OpportunitySchema,
  PainPointSchema,
  PersonaSchema,
  CompetitorSchema,
  WillingnessToPaySchema,
  SupportingQuoteSchema
} from "../src/schemas.js";

describe("SupportingQuoteSchema", () => {
  it("should validate a valid quote", () => {
    const quote = {
      text: "I've been struggling with this for months",
      permalink: "https://reddit.com/r/startups/comments/abc123"
    };

    const result = SupportingQuoteSchema.safeParse(quote);
    expect(result.success).toBe(true);
  });

  it("should allow null permalink", () => {
    const quote = {
      text: "Great insight here",
      permalink: null
    };

    const result = SupportingQuoteSchema.safeParse(quote);
    expect(result.success).toBe(true);
  });

  it("should reject missing text", () => {
    const quote = { permalink: "https://reddit.com" };

    const result = SupportingQuoteSchema.safeParse(quote);
    expect(result.success).toBe(false);
  });
});

describe("PainPointSchema", () => {
  it("should validate a complete pain point", () => {
    const painPoint = {
      category: "Customer Acquisition",
      description: "Hard to find first customers",
      quote: "I spent months trying to get my first 10 users",
      permalink: "https://reddit.com/r/startups/comments/abc123",
      frequency: "common"
    };

    const result = PainPointSchema.safeParse(painPoint);
    expect(result.success).toBe(true);
  });

  it("should validate all frequency values", () => {
    for (const frequency of ["common", "occasional", "rare"]) {
      const painPoint = {
        category: "Test",
        description: "Test description",
        quote: null,
        permalink: null,
        frequency
      };

      const result = PainPointSchema.safeParse(painPoint);
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid frequency", () => {
    const painPoint = {
      category: "Test",
      description: "Test",
      quote: null,
      permalink: null,
      frequency: "very_common"
    };

    const result = PainPointSchema.safeParse(painPoint);
    expect(result.success).toBe(false);
  });
});

describe("PersonaSchema", () => {
  it("should validate a persona", () => {
    const persona = {
      role: "Solo Founder",
      description: "Technical founders building alone",
      painPoints: ["Customer Acquisition", "Time Management"]
    };

    const result = PersonaSchema.safeParse(persona);
    expect(result.success).toBe(true);
  });

  it("should allow empty pain points array", () => {
    const persona = {
      role: "Enterprise PM",
      description: "Product managers at large companies",
      painPoints: []
    };

    const result = PersonaSchema.safeParse(persona);
    expect(result.success).toBe(true);
  });
});

describe("CompetitorSchema", () => {
  it("should validate all sentiment values", () => {
    for (const sentiment of ["positive", "neutral", "negative"]) {
      const competitor = {
        name: "Competitor X",
        sentiment,
        mentions: 5
      };

      const result = CompetitorSchema.safeParse(competitor);
      expect(result.success).toBe(true);
    }
  });
});

describe("WillingnessToPaySchema", () => {
  it("should validate WTP signals", () => {
    const wtp = {
      signals: ["Would pay for automation", "Currently paying for similar tool"],
      confidence: "medium"
    };

    const result = WillingnessToPaySchema.safeParse(wtp);
    expect(result.success).toBe(true);
  });

  it("should validate all confidence levels", () => {
    for (const confidence of ["low", "medium", "high"]) {
      const wtp = { signals: [], confidence };

      const result = WillingnessToPaySchema.safeParse(wtp);
      expect(result.success).toBe(true);
    }
  });
});

describe("TagsSchema", () => {
  it("should validate a complete tags object", () => {
    const tags = {
      painPoints: [
        {
          category: "Customer Acquisition",
          description: "Hard to find customers",
          quote: "Spent months on this",
          permalink: "https://reddit.com/abc",
          frequency: "common"
        }
      ],
      personas: [
        {
          role: "Solo Founder",
          description: "Building alone",
          painPoints: ["Customer Acquisition"]
        }
      ],
      urgency: "high",
      urgencyReason: "Multiple posts express frustration",
      competitors: [
        { name: "Competitor X", sentiment: "negative", mentions: 3 }
      ],
      willingnessToPay: {
        signals: ["Would pay for this"],
        confidence: "medium"
      }
    };

    const result = TagsSchema.safeParse(tags);
    expect(result.success).toBe(true);
  });

  it("should reject invalid urgency", () => {
    const tags = {
      painPoints: [],
      personas: [],
      urgency: "very_high",
      urgencyReason: "Test",
      competitors: [],
      willingnessToPay: { signals: [], confidence: "low" }
    };

    const result = TagsSchema.safeParse(tags);
    expect(result.success).toBe(false);
  });
});

describe("OpportunitySchema", () => {
  it("should validate a complete opportunity", () => {
    const opp = {
      id: "opp-1",
      title: "Customer Discovery Tool",
      targetUser: "Solo founders",
      problem: "Spending too much time on manual outreach",
      currentWorkaround: "Cold emails and LinkedIn",
      proposedSolution: "Automated lead qualification",
      confidence: "medium",
      confidenceReason: "Multiple mentions but unclear WTP",
      supportingQuotes: [
        { text: "I spend 4 hours a day on this", permalink: "https://reddit.com/abc" }
      ],
      risks: ["Crowded market", "Privacy concerns"],
      mvpExperiment: "Landing page with email capture"
    };

    const result = OpportunitySchema.safeParse(opp);
    expect(result.success).toBe(true);
  });

  it("should allow empty arrays", () => {
    const opp = {
      id: "opp-2",
      title: "Test Opportunity",
      targetUser: "Developers",
      problem: "Testing is hard",
      currentWorkaround: "Manual testing",
      proposedSolution: "Automated testing",
      confidence: "low",
      confidenceReason: "Limited data",
      supportingQuotes: [],
      risks: [],
      mvpExperiment: "Survey"
    };

    const result = OpportunitySchema.safeParse(opp);
    expect(result.success).toBe(true);
  });
});

describe("OpportunitiesSchema", () => {
  it("should validate opportunities wrapper", () => {
    const data = {
      opportunities: [
        {
          id: "opp-1",
          title: "Test",
          targetUser: "Users",
          problem: "Problem",
          currentWorkaround: "Manual",
          proposedSolution: "Automated",
          confidence: "high",
          confidenceReason: "Strong signals",
          supportingQuotes: [],
          risks: [],
          mvpExperiment: "Test"
        }
      ]
    };

    const result = OpportunitiesSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.opportunities).toHaveLength(1);
  });

  it("should allow empty opportunities array", () => {
    const data = { opportunities: [] };

    const result = OpportunitiesSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

