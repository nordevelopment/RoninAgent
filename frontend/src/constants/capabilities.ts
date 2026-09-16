export interface AgentCapability {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    id: 'documents',
    icon: '📊',
    title: 'Documents & Spreadsheets',
    desc: 'Read, parse, and generate .xlsx spreadsheets with formulas, .docx files, and styled PDF reports.',
  },
  {
    id: 'marketplaces',
    icon: '🛒',
    title: 'Marketplace Intelligence',
    desc: 'Live search, parse listings, and compare prices across Wildberries, Ozon, List.am & Amazon.',
  },
  {
    id: 'web-scraping',
    icon: '🌐',
    title: 'Deep Web Scraping',
    desc: 'Headless extraction and structured synthesis from websites, documentation, and dynamic SPAs.',
  },
  {
    id: 'workspace',
    icon: '📁',
    title: 'Local Workspace Engine',
    desc: 'Read, write, and manage files, inspect codebases, and run audits directly in workspace.',
  },
  {
    id: 'vision-media',
    icon: '🎨',
    title: 'Vision & Image Generation',
    desc: 'Analyze uploaded photos, charts, and screenshots, and generate AI images via Flux or Grok.',
  },
  {
    id: 'automation',
    icon: '⚡',
    title: 'Background Tasks & Cron',
    desc: 'Schedule recurring background tasks with autonomous execution and instant Telegram alerts.',
  },
];
