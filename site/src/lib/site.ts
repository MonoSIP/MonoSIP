const version = "1.7.5";
const repo = "https://github.com/MunaSIP/MunaSIP";

export const site = {
  name: "MunaSIP",
  url: "https://munasip.github.io",
  repo,
  websiteRepo: "https://github.com/MunaSIP/MunaSIP",
  version,
  release: `${repo}/releases/tag/v${version}`,
  sourceZip: `${repo}/archive/refs/tags/v${version}.zip`,
  image: `ghcr.io/munasip/munasip:${version}`,
  sourceRevision: "3f9deec1c3de77a5aeb4d8ac0f3d60153f01d418",
  developmentRevision: "18e42f6",
  reviewed: "22 October 2026",
  description:
    "A self-hosted Asterisk PBX for small offices. Connect SIP providers, route calls with visual IVR, and give your team a browser softphone and voicemail inbox. Run it with Docker on your Linux server.",
};

export const sourceDoc = (file: string) =>
  `${site.repo}/blob/v${site.version}/docs/${file}.md`;

export const releaseHighlights = [
  {
    icon: "sound",
    title: "A voicemail inbox for every extension.",
    text: "See who called, play the message, mark it read and delete it from the employee portal.",
  },
  {
    icon: "phone",
    title: "The caller ID your provider expects.",
    text: "Set the outbound phone number independently of the SIP username used to register your trunk.",
  },
  {
    icon: "shield",
    title: "Ready means the PBX is ready.",
    text: "The health endpoint waits for PostgreSQL, Asterisk and the dialplan before reporting the system healthy.",
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

export const dockerCommand = `docker run -d --name munasip \\
  --restart unless-stopped \\
  -p 3000:3000 \\
  -p 10000-10100:10000-10100/udp \\
  -v munasip-data:/data \\
  -e EXTERNAL_IP=203.0.113.10 \\
  -e PUBLIC_HOST=pbx.example.com \\
  ${site.image}`;

export const composeCommand = `git clone https://github.com/MunaSIP/MunaSIP.git
cd MunaSIP
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
    slug: "security",
    title: "Security & operations",
    detail: "Plan access, persistence and recovery.",
    icon: "shield",
  },
];
