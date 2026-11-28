const version = "1.10.0";
const repo = "https://github.com/MonoSIP/MonoSIP";

export const site = {
  name: "MonoSIP",
  url: "https://www.monosip.com",
  repo,
  websiteRepo: "https://github.com/MonoSIP/MonoSIP",
  version,
  release: `${repo}/releases/tag/v${version}`,
  sourceZip: `${repo}/archive/refs/tags/v${version}.zip`,
  image: `ghcr.io/monosip/monosip:${version}`,
  sourceRevision: "2f82da61ca07d35f5fcd16849f2f343d37ba7ef9",
  developmentRevision: "2f82da6",
  reviewed: "28 November 2026",
  description:
    "A self-hosted Asterisk PBX for small offices. Connect SIP providers, route calls with visual IVR, and give your team a browser softphone and voicemail inbox. Run it with Docker on your Linux server.",
};

/** Same path, new bytes. The query skips a CDN copy of the previous mark. */
export const brandFile = (file: string) => `/brand/${file}?v=2`;

export const sourceDoc = (file: string) =>
  `${site.repo}/blob/v${site.version}/docs/${file}.md`;

export const releaseHighlights = [
  {
    icon: "phone",
    title: "Answered calls stay answered.",
    text: "IVR → extension transfers with a recording no longer finish as NOANSWER when the caller hangs up mid-bridge. Hangup CDR and recording finalize keep disposition and billsec correct.",
  },
  {
    icon: "network",
    title: "Trunk UDP 5070 is required.",
    text: "Publish 5070/udp and set MONOSIP_TRUNK_SIP_PUBLISHED=1. Health warns when it is missing; the softphone banner only shows RTP and host issues.",
  },
  {
    icon: "sound",
    title: "Recordings after trunk continue.",
    text: "MixMonitor registers on hangup after Stasis continue to trunk dial, so answered outbound legs keep their recording file.",
  },
];
export const referenceDocs = [
  [
    "FEATURES",
    "Feature reference",
    "The supported scope, from extensions to reporting.",
  ],
  ["INSTALL", "Installation", "Image tags, volumes, ports and first boot."],
  ["DEPLOY-VPS", "VPS deployment", "Host identity, media networking and TLS."],
  [
    "FLOW-DESIGNER",
    "Flow designer",
    "Node types, variables, simulation and versioning.",
  ],
  ["TTS", "Text to speech", "Edge Neural, offline Turkish EMA and caching."],
  [
    "USER-PORTAL",
    "Employee portal",
    "Calling, recordings, voicemail and forwarding.",
  ],
  ["API", "API reference", "Authentication, endpoints and webhook events."],
  [
    "ARCHITECTURE",
    "Architecture",
    "Services, signalling and storage boundaries.",
  ],
  [
    "SERVER-SECURITY",
    "Server security",
    "Access controls and operational configuration.",
  ],
  ["DATA-MODEL", "Data model", "The records and relationships behind the PBX."],
  [
    "TEST-PLAN",
    "Test plan",
    "The project's documented verification scenarios.",
  ],
  [
    "SCREENS",
    "Product workflows",
    "A reference to the administration screens.",
  ],
];

export const dockerCommand = `docker run -d --name monosip \\
  --restart unless-stopped \\
  -p 3000:3000 \\
  -p 5070:5070/udp \\
  -p 10000-10100:10000-10100/udp \\
  -v monosip-data:/data \\
  -e EXTERNAL_IP=203.0.113.10 \\
  -e PUBLIC_HOST=pbx.example.com \\
  -e MONOSIP_TRUNK_SIP_PUBLISHED=1 \\
  -e MONOSIP_RTP_PUBLISHED=1 \\
  ${site.image}`;

export const composeCommand = `git clone https://github.com/MonoSIP/MonoSIP.git
cd MonoSIP
git checkout v${site.version}
cp .env.example .env
chmod +x scripts/gen-certs.sh
./scripts/gen-certs.sh
docker compose up --build -d`;

export const docNav = [
  {
    slug: "getting-started",
    title: "Getting started",
    detail: "Install, configure and make your first call.",
    icon: "terminal",
  },
  {
    slug: "architecture",
    title: "Architecture",
    detail: "Understand the services behind every call.",
    icon: "network",
  },
  {
    slug: "ivr",
    title: "IVR & speech",
    detail: "Design call flows with APIs and neural voices.",
    icon: "flow",
  },
  {
    slug: "softphone",
    title: "Softphone & portal",
    detail: "Give every extension a home in the browser.",
    icon: "phone",
  },
  {
    slug: "voicemail",
    title: "Voicemail & forwarding",
    detail: "Route unanswered calls and manage your messages.",
    icon: "sound",
  },
  {
    slug: "integrations",
    title: "Integrations",
    detail: "Connect your phone system to your tools.",
    icon: "code",
  },
  {
    slug: "sip-trunks",
    title: "SIP providers",
    detail: "Connect a trunk and route numbers in and out.",
    icon: "server",
  },
  {
    slug: "schedules",
    title: "Business hours & time",
    detail: "Hours, holidays, time zone and an accurate clock.",
    icon: "clock",
  },
  {
    slug: "security",
    title: "Security & operations",
    detail: "Plan access, persistence and recovery.",
    icon: "shield",
  },
];
