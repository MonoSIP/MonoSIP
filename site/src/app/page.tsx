import Link from "next/link";
import { ProductMockup } from "@/components/product-mockup";
import { Icon } from "@/components/icon";
import { CallMap } from "@/components/call-map";
import { ScreenTour } from "@/components/screen-tour";
import { CodeBlock } from "@/components/code-block";
import { Architecture } from "@/components/architecture";
import { site, dockerCommand, sourceDoc, releaseHighlights } from "@/lib/site";

const features = [
  {
    icon: "network",
    label: "01 / THE EVERYDAY ESSENTIALS",
    title: "Every desk, connected.",
    text: "Extensions, live presence, forwarding and voicemail. One password for the employee portal and SIP phone. Manage the team in one place.",
    tags: ["CSV import / export", "DND", "Desk phones"],
  },
  {
    icon: "users",
    label: "02 / A BETTER WAIT",
    title: "Keep callers in the loop.",
    text: "Ring groups and queues with six routing strategies. Position announcements, hold music, overflow and a callback option when the team is busy.",
    tags: ["Queue callback", "Wrap-up", "Overflow routes"],
  },
  {
    icon: "clock",
    label: "03 / ON YOUR SCHEDULE",
    title: "Your hours. Your rules.",
    text: "Route calls for open hours, lunch breaks and holidays. Override the schedule when plans change, with a destination for every state.",
    tags: ["Weekly schedules", "Holidays", "Manual override"],
  },
  {
    icon: "chart",
    label: "04 / THE FULL PICTURE",
    title: "Know how the day went.",
    text: "Live call activity, detailed call records and recording playback. Open a call’s IVR timeline and see the path it took.",
    tags: ["Call timelines", "Reports", "TV mode"],
  },
  {
    icon: "phone",
    label: "05 / YOUR EXISTING CONNECTIONS",
    title: "Bring your SIP provider.",
    text: "Registered or IP-based trunks, DID routing and outbound failover. Set the provider caller ID separately from the registration username.",
    tags: ["Provider caller ID", "Inbound DIDs", "Failover"],
  },
  {
    icon: "sound",
    label: "06 / AFTER THE RING",
    title: "Leave room for a message.",
    text: "Send unanswered calls to an extension’s voicemail. Employees can see the caller, play messages and manage their own inbox in the portal.",
    tags: ["Voicemail inbox", "Read state", "Forwarding"],
  },
  {
    icon: "code",
    label: "07 / CONNECT YOUR WORKFLOW",
    title: "Put calls in context.",
    text: "Use REST endpoints, signed webhooks and visual API lookups to connect your existing tools. Embed a browser call button on your website.",
    tags: ["REST API", "Webhooks", "Call widget"],
  },
  {
    icon: "shield",
    label: "08 / OPERATE WITH CLARITY",
    title: "Know when you’re ready.",
    text: "A health gate checks the database, Asterisk and dialplan. Manage HTTPS, optional admin 2FA, access rules and persistent data on your infrastructure.",
    tags: ["Readiness gate", "Automatic SSL", "Access controls"],
  },
];

const faqs = [
  [
    "What is MunaSIP?",
    "MunaSIP is an open-source Asterisk-based company PBX for small offices, designed around roughly 20 extensions. It includes an admin panel, visual IVR designer, browser softphone and employee portal.",
  ],
  [
    "What do I need to run it?",
    "Use a Linux x86-64 server with Docker. The prebuilt image targets linux/amd64. The deployment guide recommends 2–4 vCPU and 4–8 GB RAM; neural speech runs on the server’s CPU. You also need persistent storage, a public hostname and the appropriate signalling and media ports.",
  ],
  [
    "Can I keep my SIP provider and desk phones?",
    "MunaSIP supports registered and IP-based SIP trunks, multiple providers and route failover. Yealink, Fanvil and Grandstream provisioning profiles are documented. Check your provider’s transport, codecs, networking and device configuration before switching.",
  ],
  [
    "Does the softphone work on mobile?",
    "The portal works in a mobile browser, but mobile browsers can suspend background tabs. Inbound calls with the screen off are unreliable. For dependable mobile reachability, use a compatible native SIP softphone with QR provisioning. MunaSIP does not ship a first-party mobile app.",
  ],
  [
    "Does everything work offline?",
    "The PBX and your locally stored data run on your infrastructure. EMA provides offline Turkish speech after its models are built into the image. Edge Neural speech, including English, needs outbound internet access during generation. External SIP carriers and integrations have their own network requirements.",
  ],
  [
    "Can I use MunaSIP commercially or contribute?",
    "Yes, the MIT license allows commercial use, modification and redistribution with the copyright notice. You can fork and adapt MunaSIP freely. Visit the official repository for current development and contribution guidance.",
  ],
];

export default function Home() {
  const structured = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "SoftwareSourceCode"],
    name: "MunaSIP",
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Linux (linux/amd64), Docker",
    softwareVersion: site.version,
    description: site.description,
    url: site.url,
    license: `${site.repo}/blob/main/LICENSE`,
    codeRepository: site.repo,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }}
      />
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <a href={site.release} className="release-badge">
            <span className="status-dot" />
            <span className="mono">v{site.version}</span>
            <span className="badge-divider" />
            Voicemail. Caller ID. A stronger core.
            <Icon name="arrow" />
          </a>
          <p className="eyebrow">THE SELF-HOSTED COMPANY PBX</p>
          <h1 id="hero-title">
            Your calls.
            <br />
            Your flow.
            <br />
            <span>Your control.</span>
          </h1>
          <p className="hero-lead">
            Your office phone system.
            <br className="desktop-break" /> On your own infrastructure.
          </p>
          <p className="hero-description">
            Connect your SIP provider, route calls visually and give every desk
            a browser phone and voicemail inbox. Asterisk-powered, open source,
            and built for small offices of around 20 extensions.
          </p>
          <div className="button-row">
            <Link className="button primary" href="/download/">
              Get MunaSIP <Icon name="arrow" />
            </Link>
            <Link className="button secondary" href="/docs/">
              Read the docs <Icon name="external" />
            </Link>
          </div>
          <div className="hero-promises">
            <span>
              <Icon name="check" /> Asterisk powered
            </span>
            <span>
              <Icon name="check" /> Docker ready
            </span>
            <span>
              <Icon name="check" /> MIT licensed
            </span>
          </div>
        </div>
        <CallMap />
      </section>
      <div className="foundation-strip">
        <div className="container foundation-inner">
          <p>
            ONE SYSTEM.
            <br />
            <strong>THE WHOLE CONVERSATION.</strong>
          </p>
          <span>
            Asterisk <b>22</b>
          </span>
          <span>
            Visual <b>IVR</b>
          </span>
          <span>
            Browser <b>WebRTC</b>
          </span>
          <span>
            Self-hosted <b>Docker</b>
          </span>
          <span>
            English <b>+ Türkçe</b>
          </span>
        </div>
      </div>

      <section
        className="release-spotlight container"
        aria-labelledby="release-intro"
      >
        <div className="release-heading">
          <div>
            <p className="eyebrow">NOW AVAILABLE / v{site.version}</p>
            <h2 id="release-intro">More of the everyday, covered.</h2>
          </div>
          <Link className="text-link" href="/updates/">
            See what changed <Icon name="arrow" />
          </Link>
        </div>
        <div className="release-cards">
          {releaseHighlights.map((item) => (
            <article key={item.title}>
              <Icon name={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <nav className="product-shortcuts" aria-label="Explore MunaSIP">
          <a href="#panel">
            Explore the interface <Icon name="arrow" />
          </a>
          <a href="#ivr">
            Follow a call flow <Icon name="arrow" />
          </a>
          <Link href="/docs/voicemail/">
            Find your messages <Icon name="arrow" />
          </Link>
          <a href="#install">
            Plan your install <Icon name="arrow" />
          </a>
        </nav>
      </section>

      <section className="section container" id="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 / YOUR PHONE SYSTEM, IN FOCUS</p>
            <h2>
              Less switching tools.
              <br />
              <span>More connecting people.</span>
            </h2>
          </div>
          <div>
            <p>
              A clear view of your calls, your team and the routes in between.
              All in the same admin panel.
            </p>
            <a className="text-link" href={sourceDoc("SCREENS")}>
              Explore the product screens <Icon name="arrow" />
            </a>
          </div>
        </div>
        <ScreenTour />
        <p className="small muted" style={{ marginTop: 14 }}>
          Animated interface concepts with illustrative sample data.
        </p>
      </section>

      <section className="section features-section" id="features">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / BUILT FOR THE OFFICE</p>
              <h2>
                The essentials.
                <br />
                <span>Already on the line.</span>
              </h2>
            </div>
            <p>
              From the first ring to the final follow-up.
              <br />
              The everyday tools your team actually needs.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature" key={feature.title}>
                <div className="feature-icon">
                  <Icon name={feature.icon} />
                </div>
                <p className="mono feature-label">{feature.label}</p>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                <div className="feature-tags">
                  {feature.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <a className="text-link feature-more" href={sourceDoc("FEATURES")}>
            The complete feature reference <Icon name="arrow" />
          </a>
        </div>
      </section>

      <section className="section container" id="ivr">
        <div className="section-heading">
          <div>
            <p className="eyebrow">03 / VISUAL IVR & NEURAL SPEECH</p>
            <h2>
              Draw the flow.
              <br />
              <span>Let the conversation follow.</span>
            </h2>
          </div>
          <p>
            A welcome, a menu, a live API lookup. Build a call experience that
            knows where to go next.
          </p>
        </div>
        <div className="ivr-showcase">
          <figure className="image-frame ivr-main-image">
            <div className="frame-label mono">
              <Icon name="flow" /> THE VISUAL FLOW DESIGNER{" "}
              <span>ANIMATED MOCKUP</span>
            </div>
            <ProductMockup screen="ivr-designer" />
            <figcaption>
              Build, test and publish. Live calls keep the flow version they
              started with.
            </figcaption>
          </figure>
          <div className="ivr-notes">
            <article>
              <span className="note-number">01</span>
              <h3>Connect the right pieces.</h3>
              <p>
                17 node types for menus, speech, conditions, schedules, queues
                and more. Each exit has a clear next step.
              </p>
            </article>
            <article>
              <span className="note-number">02</span>
              <h3>Bring your data into the call.</h3>
              <p>
                Look up a caller in your API. Map JSON responses to variables.
                Speak the result or route to the right extension.
              </p>
            </article>
            <article>
              <span className="note-number">03</span>
              <h3>Find your voice.</h3>
              <p>
                Edge Neural voices for English and Turkish, plus EMA for offline
                Turkish. Prompts support variables and speech filters.
              </p>
            </article>
            <Link className="text-link" href="/docs/ivr/">
              Meet the flow designer <Icon name="arrow" />
            </Link>
          </div>
        </div>
        <div className="flow-ribbon" aria-label="Example IVR flow">
          <span>
            <Icon name="phone" /> Incoming call
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="sound" /> Welcome
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="flow" /> Menu
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="code" /> API lookup
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="headset" /> Right destination
          </span>
        </div>
        <p className="small muted">
          Illustrative call path. API nodes include success and error exits;
          connect a fallback before publishing.
        </p>
      </section>

      <section className="section softphone-section" id="softphone">
        <div className="container softphone-grid">
          <div className="softphone-copy">
            <p className="eyebrow">04 / A PHONE, WHERE YOU WORK</p>
            <h2>
              Your browser.
              <br />
              <span>Now taking calls.</span>
            </h2>
            <p className="section-lead">
              A full softphone. A personal portal.
              <br />
              One extension to tie it all together.
            </p>
            <p>
              Dial, answer, hold, mute and transfer from the browser. Move
              between portal pages while your call stays connected.
            </p>
            <ul className="check-list">
              <li>
                <Icon name="check" /> A mini phone on every portal page
              </li>
              <li>
                <Icon name="check" /> Directory with live coworker presence
              </li>
              <li>
                <Icon name="check" /> Your calls, recordings and voicemail inbox
              </li>
              <li>
                <Icon name="check" /> Desk phone and browser can ring together
              </li>
            </ul>
            <Link className="text-link" href="/docs/softphone/">
              Take a closer look <Icon name="arrow" />
            </Link>
            <Link
              className="text-link portal-mailbox-link"
              href="/docs/voicemail/"
            >
              Explore the voicemail inbox <Icon name="arrow" />
            </Link>
            <p className="softphone-note">
              HTTPS and microphone access required. Reloading the browser ends
              the call. Mobile background calling has limitations.
            </p>
          </div>
          <figure className="softphone-image">
            <span className="mono image-kicker">
              <span className="status-dot" /> YOUR EXTENSION. ANY DESK.
            </span>
            <ProductMockup screen="softphone" phoneOnly />
            <figcaption>
              Browser softphone · animated interface concept
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section container" id="how-it-works">
        <div className="architecture-layout">
          <div>
            <p className="eyebrow">05 / KNOW WHAT YOU’RE RUNNING</p>
            <h2>
              Open by design.
              <br />
              <span>Yours to operate.</span>
            </h2>
            <p className="section-lead">
              A familiar foundation.
              <br />A simpler way to bring it together.
            </p>
            <p>
              Asterisk handles SIP and media. The API runs your call flows and
              configuration. PostgreSQL stores the state. Your team works in the
              web app.
            </p>
            <div className="architecture-options">
              <div>
                <Icon name="server" />
                <strong>One prebuilt image</strong>
                <p>
                  Asterisk, API, web, embedded PostgreSQL and speech. Persist
                  everything under <code>/data</code>.
                </p>
              </div>
              <div>
                <Icon name="network" />
                <strong>Or Docker Compose</strong>
                <p>
                  Run the services together on a Linux VM, with nginx and coturn
                  for the edge and remote media.
                </p>
              </div>
            </div>
            <Link className="text-link" href="/docs/architecture/">
              Look under the hood <Icon name="arrow" />
            </Link>
          </div>
          <Architecture />
        </div>
      </section>

      <section className="section integration-section">
        <div className="container integration-grid">
          <div>
            <p className="eyebrow">06 / PART OF YOUR WORKFLOW</p>
            <h2>
              A good connection.
              <br />
              <span>Beyond the phone.</span>
            </h2>
            <p>
              Use an API lookup to recognize a customer. Originate a call from
              your tools. Send call events to the systems your team already
              uses.
            </p>
            <Link className="text-link" href="/docs/integrations/">
              Explore integrations <Icon name="arrow" />
            </Link>
          </div>
          <div className="integration-list">
            <article>
              <Icon name="code" />
              <div>
                <h3>REST API & webhooks</h3>
                <p>
                  Click-to-call, call records and recordings. HMAC-signed events
                  for ringing, answered, ended and missed calls.
                </p>
              </div>
              <span className="mono">01</span>
            </article>
            <article>
              <Icon name="monitor" />
              <div>
                <h3>A call button for your website</h3>
                <p>
                  Create an embeddable WebRTC call widget in Admin →
                  Integrations, with an optional callback form.
                </p>
              </div>
              <span className="mono">02</span>
            </article>
            <article>
              <Icon name="sound" />
              <div>
                <h3>Speech that works with your data</h3>
                <p>
                  Use mapped API values in prompts. Format digits, amounts and
                  other values with template filters.
                </p>
              </div>
              <span className="mono">03</span>
            </article>
          </div>
        </div>
      </section>

      <section className="section container" id="install">
        <div className="install-grid">
          <div>
            <p className="eyebrow">07 / YOUR FIRST CONNECTION</p>
            <h2>
              One image.
              <br />
              <span>A whole phone system.</span>
            </h2>
            <p className="section-lead">
              Pick a Linux server. Give it a home.
              <br />
              Bring your office online.
            </p>
            <ol className="setup-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Prepare your server.</h3>
                  <p>
                    Linux x86-64, Docker, a public hostname and persistent
                    storage. Plan 2–4 vCPU and 4–8 GB RAM.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Pull, mount and run.</h3>
                  <p>
                    Replace the example hostname and IP. Mount a persistent
                    volume at <code>/data</code> and configure the required
                    ports.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Configure your first call.</h3>
                  <p>
                    Set strong credentials, configure HTTPS, add your SIP
                    provider and connect an extension.
                  </p>
                </div>
              </li>
            </ol>
            <Link className="text-link" href="/docs/getting-started/">
              Follow the full installation guide <Icon name="arrow" />
            </Link>
          </div>
          <div className="install-terminal">
            <div className="terminal-eyebrow">
              <span className="mono">PREBUILT IMAGE</span>
              <span className="platform-tag">linux/amd64</span>
            </div>
            <CodeBlock code={dockerCommand} title="docker run" />
            <div className="terminal-note">
              <Icon name="shield" />
              <p>
                The image exposes the app on port 3000. Use an HTTPS proxy for
                your public hostname. RTP needs UDP 10000–10100; desk-phone SIP
                may also need port 5060.{" "}
                <Link href="/docs/getting-started/#networking">
                  Networking details →
                </Link>
              </p>
            </div>
            <div className="install-links">
              <a href={site.release}>
                Release notes <Icon name="external" />
              </a>
              <Link href="/download/">
                All install options <Icon name="arrow" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="security-band">
        <div className="container security-grid">
          <div className="security-title">
            <Icon name="shield" />
            <p className="eyebrow">
              OWN THE SYSTEM.
              <br />
              UNDERSTAND THE RESPONSIBILITY.
            </p>
          </div>
          <div>
            <h3>Access, on your terms.</h3>
            <p>
              Optional admin TOTP, IP allowlists, login-flood protection and
              encrypted stored integration secrets.
            </p>
          </div>
          <div>
            <h3>Your data has a home.</h3>
            <p>
              Keep CDR and recordings on your infrastructure. Configure access,
              retention, archives and your own backups.
            </p>
          </div>
          <Link className="text-link" href="/docs/security/">
            Operate thoughtfully <Icon name="arrow" />
          </Link>
        </div>
      </section>

      <section className="section container faq-section" id="faq">
        <div>
          <p className="eyebrow">A FEW GOOD QUESTIONS</p>
          <h2>
            Before you
            <br />
            <span>pick up.</span>
          </h2>
          <p>Clear answers, straight from the project.</p>
          <Link className="text-link" href="/docs/">
            Find your next step <Icon name="arrow" />
          </Link>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer], i) => (
            <details key={question}>
              <summary>
                <span className="mono">0{i + 1}</span>
                <h3>{question}</h3>
                <Icon name="plus" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section">
        <div className="container closing-inner">
          <div>
            <p className="eyebrow">GOOD CONVERSATIONS START SOMEWHERE.</p>
            <h2>
              Make the next one
              <br />
              <span>on your terms.</span>
            </h2>
            <p>Open source. Self-hosted. Ready for your office.</p>
          </div>
          <div className="closing-actions">
            <Link className="button primary" href="/download/">
              Let’s get connected <Icon name="arrow" />
            </Link>
            <a className="text-link" href={site.repo}>
              <Icon name="github" /> Explore the source <Icon name="external" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
