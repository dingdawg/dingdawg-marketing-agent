# dingdawg-marketing-agent

> Breakthrough marketing plateaus. AI content and campaigns that learn YOUR brand voice.

AI-powered content generation, SEO auditing, campaign planning, social scheduling, and brand voice analysis. Generate on-brand content, audit pages for SEO gaps, plan multi-channel campaigns, and maintain consistent brand voice across all touchpoints.

## For AI Assistants

This MCP server returns structured JSON for seamless integration:
- SEO scores with specific meta tag, heading, and keyword density metrics
- Brand voice consistency scores with tone and style breakdown
- Governance receipt on every call (audit-ready)
- Chain-ready: `brand_voice` to establish tone -> `generate_content` for assets -> `seo_audit` to optimize -> `campaign_plan` to coordinate -> `social_scheduler` to publish

Composable with any MCP client: Claude Code, Cursor, VS Code, ChatGPT Desktop, Windsurf.

## Install

```bash
npx dingdawg-marketing-agent
```

### Claude Code
```bash
claude mcp add marketing -- npx dingdawg-marketing-agent
```

### Cursor
Add to `.cursor/mcp.json`:
```json
{"mcpServers": {"marketing": {"command": "npx", "args": ["dingdawg-marketing-agent"], "env": {"DINGDAWG_API_KEY": "your-key"}}}}
```

### Full Stack (all 13 agents)
```bash
npx dingdawg-setup
```

## Tools

| Tool | Free Tier | Paid Tier |
|------|-----------|-----------|
| `generate_content` | 10/day, template-based content | Unlimited, AI-personalized with brand voice matching |
| `seo_audit` | 5 audits/day, basic meta tag checks | Unlimited, deep SEO analysis with competitor benchmarks |
| `campaign_plan` | 3 plans/day, channel recommendations | Unlimited, AI-optimized multi-channel strategy |
| `social_scheduler` | 5 posts/day, basic scheduling | Unlimited, AI-timed posting with engagement prediction |
| `brand_voice` | 5 analyses/day, tone identification | Unlimited, voice consistency scoring with style guide |

## Pricing

- **Free:** 10 content generations/day, basic analysis
- **Pro:** $49/mo, 100 calls/day, AI-powered deep analysis
- **Pay-as-you-go:** $0.25/call, no commitment

Get API key: https://dingdawg.com/developers

## Governed

Every call is receipted and auditable. Content generation includes brand voice compliance scores. SEO audits reference specific optimization standards. Campaign plans include governance-verified channel recommendations.

## Support

support@dingdawg.com | https://dingdawg.com
