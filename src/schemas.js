import { z } from "zod";

/**
 * Schema for a supporting quote with source.
 */
export const SupportingQuoteSchema = z.object({
  text: z.string().describe("The exact quote from the source material"),
  permalink: z.string().nullable().describe("Reddit permalink URL for the quote")
});

/**
 * Schema for a pain point extracted from research.
 */
export const PainPointSchema = z.object({
  category: z.string().describe("Category or theme of the pain point"),
  description: z.string().describe("Clear description of the pain point"),
  quote: z.string().nullable().describe("Supporting quote from source"),
  permalink: z.string().nullable().describe("Reddit permalink for the quote"),
  frequency: z.enum(["common", "occasional", "rare"]).describe("How often this pain point appears")
});

/**
 * Schema for a user persona.
 */
export const PersonaSchema = z.object({
  role: z.string().describe("Role or title of the persona"),
  description: z.string().describe("Description of this persona"),
  painPoints: z.array(z.string()).describe("Categories of pain points affecting this persona")
});

/**
 * Schema for a competitor mention.
 */
export const CompetitorSchema = z.object({
  name: z.string().describe("Name of the competitor"),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall sentiment toward this competitor"),
  mentions: z.number().describe("Approximate number of mentions")
});

/**
 * Schema for willingness to pay signals.
 */
export const WillingnessToPaySchema = z.object({
  signals: z.array(z.string()).describe("Specific signals indicating willingness to pay"),
  confidence: z.enum(["low", "medium", "high"]).describe("Confidence level in WTP assessment")
});

/**
 * Full tags extraction schema.
 */
export const TagsSchema = z.object({
  painPoints: z.array(PainPointSchema).describe("Extracted pain points"),
  personas: z.array(PersonaSchema).describe("Identified user personas"),
  urgency: z.enum(["low", "medium", "high"]).describe("Overall urgency level"),
  urgencyReason: z.string().describe("Explanation for the urgency level"),
  competitors: z.array(CompetitorSchema).describe("Competitors mentioned"),
  willingnessToPay: WillingnessToPaySchema.describe("Willingness to pay assessment")
});

/**
 * Schema for a product opportunity.
 */
export const OpportunitySchema = z.object({
  id: z.string().describe("Unique identifier like opp-1, opp-2"),
  title: z.string().describe("Short descriptive title for the opportunity"),
  targetUser: z.string().describe("Primary persona this targets"),
  problem: z.string().describe("Clear problem statement"),
  currentWorkaround: z.string().describe("How users currently solve this"),
  proposedSolution: z.string().describe("High-level solution idea"),
  confidence: z.enum(["low", "medium", "high"]).describe("Confidence level"),
  confidenceReason: z.string().describe("Why this confidence level"),
  supportingQuotes: z.array(SupportingQuoteSchema).describe("Quotes supporting this opportunity"),
  risks: z.array(z.string()).describe("Potential risks or concerns"),
  mvpExperiment: z.string().describe("Quick way to test this idea")
});

/**
 * Schema for the opportunities array.
 */
export const OpportunitiesSchema = z.object({
  opportunities: z.array(OpportunitySchema).describe("List of product opportunities")
});

