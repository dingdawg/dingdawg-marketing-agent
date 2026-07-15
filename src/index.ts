#!/usr/bin/env node
/**
 * dingdawg-marketing-agent v2 — Thin Client MCP Server
 *
 * FREE tier: basic local content templates & SEO checks (the hook)
 * PAID tier: LLM-powered content generation & strategy via DingDawg API
 *
 * Install: npx dingdawg-marketing-agent
 * Claude Code: claude mcp add dingdawg-marketing-agent npx dingdawg-marketing-agent
 *
 * Set DINGDAWG_API_KEY for paid features:
 *   export DINGDAWG_API_KEY=your_key
 *
 * Optional: set DINGDAWG_MODEL env var to override the analysis model
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = process.env.DINGDAWG_API_URL || "https://api.dingdawg.com";
const API_ENDPOINT = `${API_BASE}/v1/govern/execute`;
const API_KEY = process.env.DINGDAWG_API_KEY || "";
const MODEL = process.env.DINGDAWG_MODEL || "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Persistent rate limiting
// ---------------------------------------------------------------------------

const RATE_FILE = path.join(os.homedir(), ".dingdawg", "marketing", "usage.json");

const MACHINE_ID = crypto.createHash("sha256")
  .update(`${os.hostname()}-${os.userInfo().username}-${os.platform()}-${os.arch()}`)
  .digest("hex").slice(0, 16);

const TOOL_LIMITS: Record<string, number> = {
  generate_content: 10,
  seo_audit: 10,
  campaign_plan: 5,
  social_scheduler: 15,
  brand_voice: 5,
};

function checkFreeRateLimit(tool: string): { allowed: boolean; remaining: number } {
  const limit = TOOL_LIMITS[tool] ?? 10;
  const key = `${MACHINE_ID}_${tool}`;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let store: Record<string, { count: number; resetAt: number }> = {};
  try {
    const dir = path.dirname(RATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(RATE_FILE)) {
      store = JSON.parse(fs.readFileSync(RATE_FILE, "utf-8"));
    }
  } catch { /* fresh start */ }

  const entry = store[key];
  if (!entry || now > entry.resetAt) {
    store[key] = { count: 1, resetAt: now + dayMs };
  } else if (entry.count >= limit) {
    try { fs.writeFileSync(RATE_FILE, JSON.stringify(store)); } catch {}
    return { allowed: false, remaining: 0 };
  } else {
    store[key].count++;
  }

  try { fs.writeFileSync(RATE_FILE, JSON.stringify(store)); } catch {}
  const current = store[key].count;
  return { allowed: true, remaining: limit - current };
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

async function callApi(
  tool: string,
  input: Record<string, unknown>,
): Promise<ApiResponse> {
  if (!API_KEY) {
    return { success: false, error: "no_api_key" };
  }

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        agent: "marketing",
        tool,
        input,
        model: MODEL,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, error: `API returned ${res.status}: ${body}` };
    }

    const data = await res.json() as Record<string, unknown>;
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `API request failed: ${message}` };
  }
}

function upgradeMessage(): string {
  return [
    "",
    "━━━ Upgrade to DingDawg Pro ━━━",
    "Get LLM-powered content generation, SEO analysis,",
    "campaign strategy, and brand voice optimization.",
    "",
    "  export DINGDAWG_API_KEY=your_key",
    "",
    "Get your key at: https://dingdawg.com/developers",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Local helpers — FREE tier
// ---------------------------------------------------------------------------

function basicSeoCheck(content: string, keyword?: string): {
  word_count: number;
  readability: string;
  keyword_density: number | null;
  suggestions: string[];
} {
  const words = content.split(/\s+/).filter(Boolean);
  const word_count = words.length;
  const sentences = content.split(/[.!?]+/).filter(Boolean);
  const avgSentenceLen = sentences.length > 0 ? word_count / sentences.length : word_count;
  const readability = avgSentenceLen < 15 ? "Easy" : avgSentenceLen < 25 ? "Moderate" : "Complex";

  let keyword_density: number | null = null;
  const suggestions: string[] = [];

  if (keyword) {
    const kwLower = keyword.toLowerCase();
    const occurrences = content.toLowerCase().split(kwLower).length - 1;
    keyword_density = word_count > 0 ? Math.round((occurrences / word_count) * 1000) / 10 : 0;
    if (keyword_density < 0.5) suggestions.push(`Low keyword density (${keyword_density}%). Target 1-2%.`);
    if (keyword_density > 3) suggestions.push(`Keyword stuffing risk (${keyword_density}%). Reduce to 1-2%.`);
  }

  if (word_count < 300) suggestions.push("Content under 300 words — may underperform in search.");
  if (word_count > 3000) suggestions.push("Content over 3000 words — consider splitting.");
  if (readability === "Complex") suggestions.push("High reading complexity — simplify sentence structure.");

  return { word_count, readability, keyword_density, suggestions };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "dingdawg-marketing-agent",
  version: "2.0.0",
});
// readOnlyHint: all tools are read-only analysis — no side effects
const rtool = (name: string, desc: string, schema: any, cb: (args: Record<string, any>) => any) =>
  server.registerTool(name, { description: desc, inputSchema: schema, annotations: { readOnlyHint: true } }, cb);


// ---------------------------------------------------------------------------
// generate_content
// ---------------------------------------------------------------------------

rtool(
  "generate_content",
  "Generate marketing content. Types: blog_post, social_media, email, ad_copy. " +
  "FREE: 10 generations/day (basic outline). LLM-powered full content with API key.",
  {
    content_type: z.enum(["blog_post", "social_media", "email", "ad_copy"]).describe("Type of content to generate"),
    topic: z.string().min(3).describe("Topic or subject for the content"),
    audience: z.string().optional().describe("Target audience"),
    tone: z.string().optional().describe("Desired tone (professional, casual, persuasive, etc.)"),
    keywords: z.string().optional().describe("Target keywords (comma-separated)"),
  },
  async ({ content_type, topic, audience, tone, keywords }) => {
    const rateCheck = checkFreeRateLimit("generate_content");
    if (!rateCheck.allowed) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Free tier limit reached (10 generations per 24 hours). Resets automatically.", upgrade: "export DINGDAWG_API_KEY=your_key — https://dingdawg.com/developers", governed: true }) }] };
    }

    if (API_KEY) {
      const apiResult = await callApi("generate_content", { content_type, topic, audience: audience || "", tone: tone || "", keywords: keywords || "" });
      if (apiResult.success && apiResult.data) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ mode: "deep_analysis", powered_by: "DingDawg Marketing API", ...apiResult.data, receipt_id: `gc_${Date.now().toString(36)}`, governed: true }, null, 2) }] };
      }
    }

    const outlines: Record<string, string> = {
      blog_post: `Blog Post Outline: "${topic}"\n\n1. Introduction — Hook + problem statement\n2. Background — Context and why it matters\n3. Main Points — 3-5 key sections\n4. Practical Takeaways\n5. Conclusion — Summary + CTA`,
      social_media: `Social Post Framework: "${topic}"\n\nHook: [Attention-grabbing opening]\nValue: [Key insight about ${topic}]\nCTA: [What should they do next?]\nHashtags: [3-5 relevant tags]`,
      email: `Email Framework: "${topic}"\n\nSubject: [Curiosity/benefit driven]\nPreview: [First 90 chars]\nBody: Problem > Agitation > Solution\nCTA: [Single clear action]`,
      ad_copy: `Ad Copy Framework: "${topic}"\n\nHeadline: [Benefit-driven, under 30 chars]\nDescription: [Pain point > solution]\nCTA: [Action verb + benefit]`,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          mode: "local_basic",
          content_type,
          topic,
          outline: outlines[content_type] || "Outline not available.",
          note: "Free tier provides outlines only. Full LLM-generated content requires API key.",
          teaser: "Get complete, publish-ready content with SEO optimization and platform-specific formatting: export DINGDAWG_API_KEY=your_key",
          upgrade_url: "https://dingdawg.com/developers",
          receipt_id: `gc_${Date.now().toString(36)}`,
          free_generations_remaining: rateCheck.remaining,
          governed: true,
        }, null, 2),
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// seo_audit
// ---------------------------------------------------------------------------

rtool(
  "seo_audit",
  "Audit content for SEO optimization. Analyzes keyword density, readability, structure. " +
  "FREE: 10 audits/day (basic checks). Deep LLM-powered SEO analysis with API key.",
  {
    content: z.string().min(10).describe("Content to audit for SEO"),
    target_keyword: z.string().optional().describe("Primary target keyword"),
    url: z.string().optional().describe("Page URL for context"),
  },
  async ({ content, target_keyword, url }) => {
    const rateCheck = checkFreeRateLimit("seo_audit");
    if (!rateCheck.allowed) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Free tier limit reached (10 audits per 24 hours). Resets automatically.", upgrade: "export DINGDAWG_API_KEY=your_key — https://dingdawg.com/developers", governed: true }) }] };
    }

    if (API_KEY) {
      const apiResult = await callApi("seo_audit", { content, target_keyword: target_keyword || "", url: url || "" });
      if (apiResult.success && apiResult.data) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ mode: "deep_analysis", powered_by: "DingDawg Marketing API", ...apiResult.data, receipt_id: `seo_${Date.now().toString(36)}`, governed: true }, null, 2) }] };
      }
    }

    const result = basicSeoCheck(content, target_keyword);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          mode: "local_basic",
          word_count: result.word_count,
          readability: result.readability,
          keyword_density: result.keyword_density,
          suggestions: result.suggestions,
          note: "Basic checks only. Heading analysis, meta tags, and competitor comparison require API key.",
          teaser: "Get comprehensive SEO scoring, competitor gap analysis, and SERP predictions: export DINGDAWG_API_KEY=your_key",
          upgrade_url: "https://dingdawg.com/developers",
          receipt_id: `seo_${Date.now().toString(36)}`,
          free_audits_remaining: rateCheck.remaining,
          governed: true,
        }, null, 2),
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// campaign_plan
// ---------------------------------------------------------------------------

rtool(
  "campaign_plan",
  "Generate a marketing campaign plan with channel strategy, content calendar, and KPI targets. " +
  "FREE: 5 plans/day (basic framework). Comprehensive LLM-powered strategy with API key.",
  {
    goal: z.string().describe("Campaign goal (brand awareness, lead gen, product launch, etc.)"),
    product: z.string().describe("Product or service being marketed"),
    audience: z.string().describe("Target audience description"),
    budget: z.string().optional().describe("Budget range"),
    duration: z.string().optional().describe("Campaign duration"),
  },
  async ({ goal, product, audience, budget, duration }) => {
    const rateCheck = checkFreeRateLimit("campaign_plan");
    if (!rateCheck.allowed) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Free tier limit reached (5 plans per 24 hours). Resets automatically.", upgrade: "export DINGDAWG_API_KEY=your_key — https://dingdawg.com/developers", governed: true }) }] };
    }

    if (API_KEY) {
      const apiResult = await callApi("campaign_plan", { goal, product, audience, budget: budget || "", duration: duration || "" });
      if (apiResult.success && apiResult.data) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ mode: "deep_analysis", powered_by: "DingDawg Marketing API", ...apiResult.data, receipt_id: `cp_${Date.now().toString(36)}`, governed: true }, null, 2) }] };
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          mode: "local_basic",
          goal, product, audience,
          framework: {
            channels: ["Content Marketing", "Social Media", "Email", "Paid Ads"],
            phases: ["Awareness", "Consideration", "Conversion", "Retention"],
            kpis: ["Impressions", "Click-through Rate", "Conversion Rate", "CAC", "LTV"],
          },
          note: "Free tier provides framework only. Detailed strategy and content calendar require API key.",
          teaser: "Get a complete campaign strategy with weekly content calendar, budget allocation, and ROI projections: export DINGDAWG_API_KEY=your_key",
          upgrade_url: "https://dingdawg.com/developers",
          receipt_id: `cp_${Date.now().toString(36)}`,
          free_plans_remaining: rateCheck.remaining,
          governed: true,
        }, null, 2),
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// social_scheduler
// ---------------------------------------------------------------------------

rtool(
  "social_scheduler",
  "Plan and organize social media posts with platform-optimized content and best posting times. " +
  "FREE: 15 schedules/day (basic planning). LLM-powered optimization with API key.",
  {
    platform: z.enum(["twitter", "linkedin", "instagram", "facebook", "tiktok"]).describe("Social media platform"),
    topic: z.string().describe("Post topic or message"),
    post_count: z.number().optional().describe("Number of posts to plan (default: 5)"),
    time_zone: z.string().optional().describe("Your timezone"),
  },
  async ({ platform, topic, post_count, time_zone }) => {
    const rateCheck = checkFreeRateLimit("social_scheduler");
    if (!rateCheck.allowed) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Free tier limit reached (15 schedules per 24 hours). Resets automatically.", upgrade: "export DINGDAWG_API_KEY=your_key — https://dingdawg.com/developers", governed: true }) }] };
    }

    if (API_KEY) {
      const apiResult = await callApi("social_scheduler", { platform, topic, post_count: post_count || 5, time_zone: time_zone || "America/Denver" });
      if (apiResult.success && apiResult.data) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ mode: "deep_analysis", powered_by: "DingDawg Marketing API", ...apiResult.data, receipt_id: `ss_${Date.now().toString(36)}`, governed: true }, null, 2) }] };
      }
    }

    const bestTimes: Record<string, string[]> = {
      twitter: ["9:00 AM", "12:00 PM", "5:00 PM"],
      linkedin: ["8:00 AM", "10:00 AM", "12:00 PM"],
      instagram: ["11:00 AM", "1:00 PM", "7:00 PM"],
      facebook: ["9:00 AM", "1:00 PM", "4:00 PM"],
      tiktok: ["7:00 AM", "12:00 PM", "7:00 PM"],
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          mode: "local_basic",
          platform, topic,
          suggested_posting_times: bestTimes[platform] || bestTimes.twitter,
          post_count_requested: post_count || 5,
          note: "Free tier provides best posting times only. Full content generation and hashtag research require API key.",
          teaser: "Get platform-optimized post content, trending hashtags, and engagement predictions: export DINGDAWG_API_KEY=your_key",
          upgrade_url: "https://dingdawg.com/developers",
          receipt_id: `ss_${Date.now().toString(36)}`,
          free_schedules_remaining: rateCheck.remaining,
          governed: true,
        }, null, 2),
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// brand_voice
// ---------------------------------------------------------------------------

rtool(
  "brand_voice",
  "Analyze sample content to define your brand voice. Returns tone, formality, personality traits. " +
  "FREE: 5 analyses/day (basic). LLM-powered brand voice profiling with API key.",
  {
    sample_content: z.string().min(50).describe("Sample content that represents your brand voice"),
    brand_name: z.string().optional().describe("Brand name for the analysis"),
    industry: z.string().optional().describe("Industry for benchmarking"),
  },
  async ({ sample_content, brand_name, industry }) => {
    const rateCheck = checkFreeRateLimit("brand_voice");
    if (!rateCheck.allowed) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Free tier limit reached (5 analyses per 24 hours). Resets automatically.", upgrade: "export DINGDAWG_API_KEY=your_key — https://dingdawg.com/developers", governed: true }) }] };
    }

    if (API_KEY) {
      const apiResult = await callApi("brand_voice", { sample_content, brand_name: brand_name || "", industry: industry || "" });
      if (apiResult.success && apiResult.data) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ mode: "deep_analysis", powered_by: "DingDawg Marketing API", ...apiResult.data, receipt_id: `bv_${Date.now().toString(36)}`, governed: true }, null, 2) }] };
      }
    }

    const words = sample_content.split(/\s+/).filter(Boolean);
    const avgWordLen = words.reduce((s: number, w: string) => s + w.length, 0) / (words.length || 1);
    const sentences = sample_content.split(/[.!?]+/).filter(Boolean);
    const avgSentenceLen = words.length / (sentences.length || 1);
    const formality = avgWordLen > 5.5 ? "Formal" : avgWordLen > 4.5 ? "Professional" : "Casual";
    const complexity = avgSentenceLen > 20 ? "Complex" : avgSentenceLen > 12 ? "Moderate" : "Simple";

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          mode: "local_basic",
          brand_name: brand_name || "unspecified",
          word_count: words.length,
          estimated_formality: formality,
          estimated_complexity: complexity,
          avg_word_length: Math.round(avgWordLen * 10) / 10,
          avg_sentence_length: Math.round(avgSentenceLen * 10) / 10,
          note: "Basic statistical analysis only. Personality traits, tone guidelines, and voice profiles require API key.",
          teaser: "Get a complete brand voice profile with personality traits, writing rules, and content examples: export DINGDAWG_API_KEY=your_key",
          upgrade_url: "https://dingdawg.com/developers",
          receipt_id: `bv_${Date.now().toString(36)}`,
          free_analyses_remaining: rateCheck.remaining,
          governed: true,
        }, null, 2),
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => { console.error("Server failed:", err); process.exit(1); });
