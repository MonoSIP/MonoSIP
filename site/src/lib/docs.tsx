import { ProductMockup } from "@/components/product-mockup";
import Link from "next/link";
import { Architecture } from "@/components/architecture";
import { CodeBlock } from "@/components/code-block";
import { Icon } from "@/components/icon";
import { composeCommand, dockerCommand, sourceDoc, site } from "./site";

function Callout({
  children,
  warning = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`callout ${warning ? "warning" : ""}`}>
      <Icon name="shield" />
      <div>{children}</div>
    </div>
  );
}
function Table({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label={headings.join(", ")}
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export const docs: Record<
  string,
  {
    title: string;
    summary: string;
    source: string;
    sections: { id: string; title: string; content: React.ReactNode }[];
  }
> = {
  "getting-started": {
    title: "Your first connection.",
    summary:
      "Run MunaSIP on your Linux server, configure the essentials and connect your first extension.",
    source: "INSTALL",
    sections: [
      {
        id: "requirements",
        title: "Start with the right host",
        content: (
          <>
            <p>
              The supported production path is Docker on a Linux VM. The
              prebuilt image is published for <code>linux/amd64</code>; the
              bundled EMA speech dependencies are AMD64-specific. A macOS lab
              can be useful for exploring the panel, but it is not the
              recommended SIP/RTP deployment.
            </p>
            <Table
              headings={["Requirement", "Guidance"]}
              rows={[
                [
                  "Operating system",
                  "Debian 12/13 or Ubuntu 22.04+ on x86-64, with Docker Engine and Compose v2.",
                ],
                [
                  "CPU and memory",
                  "Plan 2–4 vCPU and 4–8 GB RAM for a small office of roughly 20 extensions. Speech synthesis uses the PBX CPU.",
                ],
                [
                  "Identity",
                  "A public IPv4 address and a hostname pointing to the server.",
                ],
                [
                  "Storage",
                  "A real persistent volume at /data for the all-in-one image. Size recordings and backups for your retention policy.",
                ],
              ]}
            />
          </>
        ),
      },
      {
        id: "docker",
        title: "Option 1: the prebuilt Docker image",
        content: (
          <>
            <p>
              The all-in-one image contains the web panel, API, Asterisk,
              embedded PostgreSQL and speech engines. The command below pins
              release {site.version}. Replace <code>203.0.113.10</code> and{" "}
              <code>pbx.example.com</code> with your actual public IP and
              hostname.
            </p>
            <CodeBlock code={dockerCommand} title="docker run" />
            <p>
              Put the application port 3000 behind an HTTPS reverse proxy for
              your public hostname. Browser calling needs HTTPS, working WSS
              signalling and reachable media ports. The image can also use a
              managed PostgreSQL instance via <code>DATABASE_URL</code>.
            </p>
            <Callout>
              <p>
                Keep the <code>/data</code> volume and{" "}
                <code>/data/.munasip-secrets</code> backed up. They contain the
                database, generated configuration, recordings and keys needed to
                read encrypted secrets. With a public hostname, boot checks that
                the data directory is a real volume.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "compose",
        title: "Option 2: build with Docker Compose",
        content: (
          <>
            <p>
              Compose runs the services with nginx and coturn. This is the
              documented route for controlling the complete edge and media
              stack. The certificate script below creates a lab certificate. For
              public operation, configure your hostname, strong secrets and a
              trusted HTTPS certificate.
            </p>
            <CodeBlock code={composeCommand} title="Docker Compose" />
            <p>
              The lab panel opens at <code>https://localhost</code>. For
              production, edit <code>.env</code> before starting the stack. Set{" "}
              <code>EXTERNAL_IP</code>, <code>PUBLIC_HOST</code>,{" "}
              <code>PUBLIC_URL</code>, <code>SIP_DOMAIN</code>,{" "}
              <code>SIP_WSS_URL</code>, database credentials, session/encryption
              keys and the admin password. Follow the{" "}
              <a href={sourceDoc("DEPLOY-VPS")}>upstream VPS guide</a> for the
              complete configuration.
            </p>
          </>
        ),
      },
      {
        id: "networking",
        title: "Get signalling and audio connected",
        content: (
          <>
            <p>
              A working web panel does not prove that calling audio works. SIP
              signalling, browser WSS and RTP media have different paths.
              Restrict SIP access to the office, VPN and provider addresses
              wherever possible.
            </p>
            <Table
              headings={["Port / path", "Purpose", "Deployment note"]}
              rows={[
                [
                  "3000/TCP",
                  "All-in-one application / API",
                  "Publish behind a trusted HTTPS proxy. Proxy /asterisk-ws for browser signalling.",
                ],
                [
                  "443/TCP",
                  "Public HTTPS and WSS",
                  "nginx handles this in Compose. Compose can multiplex TURNS on 443.",
                ],
                [
                  "80/TCP",
                  "ACME HTTP-01 / redirect",
                  "Must reach the server when using automatic Let’s Encrypt HTTP-01.",
                ],
                [
                  "10000–10100/UDP",
                  "Asterisk RTP audio",
                  "Publish and set EXTERNAL_IP correctly; scope firewall rules to the required media peers.",
                ],
                [
                  "5060/UDP or TCP",
                  "Desk-phone / provider SIP",
                  "Not published by the quick command; add it when required and restrict sources.",
                ],
                [
                  "TURN / TURNS",
                  "Remote WebRTC media relay",
                  "Compose includes coturn. A platform HTTPS proxy alone does not replace a media relay.",
                ],
              ]}
            />
            <p>
              On a platform edge without the Compose ALPN mux, the install guide
              documents <code>MUNASIP_RTP_PUBLISHED=1</code> when RTP is
              actually published, and <code>MUNASIP_TURNS_ON_443=0</code> for a
              deliberate STUN-only deployment. Review your network before
              applying either option.
            </p>
          </>
        ),
      },
      {
        id: "readiness",
        title: "Check the PBX, not just the web page",
        content: (
          <>
            <p>
              From v1.7.5, the health endpoint stays unhealthy until the
              database, Asterisk and generated dialplan are ready. Wait for it
              before testing registration or placing a call.
            </p>
            <CodeBlock
              code="curl --fail https://pbx.example.com/api/v1/health"
              title="Check service readiness"
            />
            <p>
              Use your own hostname. If the endpoint is not healthy, inspect the
              container logs and persistent volume before treating a reachable
              login page as a working PBX.
            </p>
          </>
        ),
      },
      {
        id: "first-call",
        title: "Set up the first conversation",
        content: (
          <>
            <ol>
              <li>
                Sign in to the admin panel. Lab defaults are{" "}
                <code>admin@example.com</code> / <code>Admin123!</code>; replace
                them before exposing the installation.
              </li>
              <li>
                Set the hostname and configure trusted HTTPS. In the Compose
                deployment, Admin → Settings → Hostname & SSL offers automatic
                Let’s Encrypt certificates.
              </li>
              <li>
                Add your SIP provider, then configure inbound DIDs and outbound
                routes.
              </li>
              <li>
                Create or review extensions. Each extension uses one password
                for the portal and SIP. Rotate any seeded lab passwords.
              </li>
              <li>
                Sign in to the portal using an extension. Allow microphone
                access, confirm registration, and test both directions of audio.
              </li>
              <li>
                Call another extension, then test your actual provider route,
                queue, after-hours destination and recording policy.
              </li>
            </ol>
            <Callout warning>
              <p>
                This site documents setup; it does not run or test your PBX.
                Validate the carrier, NAT, audio, caller ID and recovery path
                with your actual infrastructure before a cutover.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "updates",
        title: "Update without losing the state",
        content: (
          <>
            <p>
              Back up first. Pull the selected image tag and recreate the
              container with the same environment, ports and persistent volume.
              Pulling an image alone does not replace a running container.
            </p>
            <CodeBlock
              code={`docker pull ${site.image}\n# Recreate the service with the same /data volume and configuration.`}
              title="image update"
            />
            <p>
              For Compose, named volumes retain state across rebuilds.{" "}
              <code>docker compose down</code> keeps volumes; adding{" "}
              <code>-v</code> deletes them. Review the{" "}
              <a href={sourceDoc("INSTALL")}>upstream install guide</a> for
              migration and backup details.
            </p>
          </>
        ),
      },
    ],
  },
  architecture: {
    title: "Every component, connected.",
    summary:
      "Asterisk for the media. An API for your flows. A web interface for the team. Understand the system you operate.",
    source: "ARCHITECTURE",
    sections: [
      {
        id: "overview",
        title: "Two planes, one phone system",
        content: (
          <>
            <p>
              The media plane is Asterisk 22 with PJSIP, ARI and AMI. The
              control plane is a Node/Fastify API that writes Asterisk
              configuration and executes IVR graphs. Employees and
              administrators use the React web application.
            </p>
            <Architecture />
            <p>
              The diagram represents the Docker Compose service layout. The
              all-in-one image bundles the application, Asterisk, embedded
              PostgreSQL and speech process tree; Compose provides separate
              services, an nginx edge and coturn.
            </p>
          </>
        ),
      },
      {
        id: "call-path",
        title: "Follow a call",
        content: (
          <>
            <ol>
              <li>
                A SIP provider or phone reaches Asterisk using the configured
                transport and media ports.
              </li>
              <li>
                Inbound routes select a destination: extension, ring group,
                queue, IVR, schedule or another supported target.
              </li>
              <li>
                The API’s ARI flow engine runs the published IVR graph. Nodes
                can play prompts, collect digits, query an API and select a
                destination.
              </li>
              <li>
                Asterisk handles the connected media and configured MixMonitor
                recording.
              </li>
              <li>
                AMI/ARI events feed live status and logs through the API.
                WebSocket updates reach the panel and portal.
              </li>
            </ol>
            <p>
              The browser softphone registers over WSS through{" "}
              <code>/asterisk-ws</code>. WebRTC media uses DTLS-SRTP; coturn
              supports off-site media traversal.
            </p>
          </>
        ),
      },
      {
        id: "services",
        title: "What each service owns",
        content: (
          <Table
            headings={["Component", "Responsibility"]}
            rows={[
              [
                "nginx (Compose)",
                "HTTPS, ACME, reverse proxy for the web app, API and Asterisk WSS; optional TURNS multiplexing.",
              ],
              [
                "Web",
                "Admin and employee portal; browser softphone uses SIP.js.",
              ],
              [
                "Fastify API",
                "Sessions, integration API, ARI flow execution, configuration generation, certificate client and background jobs.",
              ],
              [
                "Asterisk 22",
                "SIP endpoints, queues, dialplan, call control and media/recording.",
              ],
              [
                "PostgreSQL",
                "Source of truth for extensions, routes, flows, CDR and settings.",
              ],
              [
                "Speech engines",
                "Edge Neural online synthesis and embedded EMA offline Turkish synthesis.",
              ],
              ["coturn (Compose)", "TURN relay for remote browser softphones."],
            ]}
          />
        ),
      },
      {
        id: "persistence",
        title: "Persistence is part of the architecture",
        content: (
          <>
            <p>
              The single image uses <code>/data</code> for the embedded
              database, settings, secrets, Asterisk configuration and
              recordings. With Compose, named volumes include{" "}
              <code>pgdata</code>, <code>recordings</code>, <code>uploads</code>{" "}
              and <code>asterisk_config</code>; certificates are bind-mounted.
            </p>
            <p>
              A volume is persistence, not a backup. Plan database exports,
              recording archives and recovery of encryption keys. Test restores
              separately from an ordinary application restart.
            </p>
          </>
        ),
      },
      {
        id: "boundaries",
        title: "Know the boundaries",
        content: (
          <>
            <p>
              MunaSIP targets a small office around 20 extensions. It is not a
              documented automatic high-availability cluster. Carrier-side
              failover can redirect inbound calls if the PBX host or uplink
              fails.
            </p>
            <p>
              The documented scope does not include video meetings, team chat,
              WhatsApp, predictive dialing or first-party desktop/mobile apps.
              Integrate external tools through the API and webhooks where
              appropriate.
            </p>
          </>
        ),
      },
    ],
  },
  ivr: {
    title: "Design the conversation.",
    summary:
      "Build your call routes on a visual canvas, bring data into the flow and publish changes with a clear fallback.",
    source: "FLOW-DESIGNER",
    sections: [
      {
        id: "canvas",
        title: "A map of the whole call",
        content: (
          <>
            <p>
              Drag nodes onto the canvas and connect each exit to the next step.
              Flows are stored as JSON and executed by the API’s ARI engine. A
              draft is separate from the published version used by live calls.
            </p>
            <figure className="image-frame">
              <ProductMockup screen="ivr-designer" />
              <figcaption>
                Animated interface concept. Demo values describe a sample flow.
              </figcaption>
            </figure>
          </>
        ),
      },
      {
        id: "nodes",
        title: "17 node types, clear exits",
        content: (
          <Table
            headings={["Node", "Use"]}
            rows={[
              ["Start", "Entry point, with caller, did and time variables."],
              ["Announce / TTS", "Play a WAV prompt or speak templated text."],
              [
                "Menu / Get key",
                "Collect DTMF digits; handle timeout and invalid input.",
              ],
              [
                "API request",
                "Make an HTTP request and map JSON response values.",
              ],
              ["If / Set variable", "Branch on data or update flow variables."],
              [
                "Pause / Language",
                "Wait, optionally with hold music; change prompt language.",
              ],
              [
                "Schedule / Directory",
                "Select by business hours or dial by name.",
              ],
              ["Subflow", "Run another flow and return."],
              [
                "Transfer / Queue",
                "Connect an extension or destination, or join a queue.",
              ],
              ["Voicemail / Hangup", "Leave a message or finish the call."],
            ]}
          />
        ),
      },
      {
        id: "api-node",
        title: "Connect a live API",
        content: (
          <>
            <p>
              The API request node supports GET, POST, PUT, PATCH and DELETE,
              templated URLs/headers/bodies, and response mapping via JSON
              paths. Authentication can use Bearer, Basic or a custom header.
              Store credentials in Settings → Secrets instead of the flow JSON.
            </p>
            <p>
              The default timeout is 3 seconds, up to 10 seconds, with an
              optional single retry. Timeouts, non-success responses and
              unparseable data follow the error exit. A flow cannot publish with
              that exit left unconnected.
            </p>
            <CodeBlock
              code={
                '# Conceptual mapping inside an API request node\n# Response: {"customer": true, "agent": "201"}\n$.customer  -> known_customer\n$.agent     -> agent\n\n# Next: condition -> transfer to the mapped agent\n# Error: route to the general support queue'
              }
              title="API node mapping"
            />
            <figure className="image-frame">
              <ProductMockup screen="ivr-api-settings" />
              <figcaption>
                Configure the request and test the mapped values in the
                designer.
              </figcaption>
            </figure>
          </>
        ),
      },
      {
        id: "speech",
        title: "Put the right words on the line",
        content: (
          <>
            <p>
              Use <code>{"$name"}</code> or <code>{"{{name}}"}</code> in speech
              and API templates. Filters format values, including{" "}
              <code>digits</code>, <code>round</code>, <code>amount</code>,{" "}
              <code>province</code> and <code>ascii</code>. Prompts are
              synthesized sentence by sentence and cached.
            </p>
            <Table
              headings={["Engine", "Language / connectivity"]}
              rows={[
                [
                  "Edge Neural",
                  "English and Turkish voices; internet access needed during generation.",
                ],
                [
                  "EMA Lightning",
                  "Offline Turkish neural speech; weights are baked into the image. Uses the PBX CPU.",
                ],
              ]}
            />
            <Callout>
              <p>
                Offline English synthesis is not provided. Edge speech sends
                synthesis requests to an external service. Choose engines and
                prompt content according to your own privacy requirements.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "publishing",
        title: "Test, publish and roll back",
        content: (
          <>
            <ol>
              <li>
                Validate missing destinations, unconnected exits, unreachable
                nodes and cycles, including subflows.
              </li>
              <li>
                Simulate caller, DID, date/time and keypad inputs. Inspect
                variables and visited steps. Use mock API JSON or a real test
                endpoint deliberately.
              </li>
              <li>
                Publish the reviewed draft. Existing calls finish on the version
                they started with.
              </li>
              <li>
                Keep version history for rollback, and export JSON for your own
                records.
              </li>
            </ol>
            <p>
              Simulation helps inspect logic. Test real media, timings and
              provider routes on your PBX before directing business calls to a
              new flow.
            </p>
          </>
        ),
      },
    ],
  },
  softphone: {
    title: "Your extension, in the browser.",
    summary:
      "Sign in to a personal portal, make calls and keep the conversation connected as you move between its pages.",
    source: "USER-PORTAL",
    sections: [
      {
        id: "sign-in",
        title: "One extension, one sign-in",
        content: (
          <>
            <p>
              Employees sign in using an extension number and the password set
              or generated by the administrator. The same password is used for
              portal and SIP access. Changing it updates both; desk phones need
              the new value and the browser picks it up at the next sign-in.
            </p>
            <p>
              Portal access is configurable per extension. Rotate lab passwords
              and use a strong secret: the password also protects SIP
              registration.
            </p>
          </>
        ),
      },
      {
        id: "calling",
        title: "The everyday call controls",
        content: (
          <>
            <p>
              The softphone supports dialing, answering, DTMF, hold, mute, blind
              transfer and attended transfer. Choose microphone, speaker and
              ringtone devices in the portal. The directory shows coworkers who
              are idle, busy or on DND.
            </p>
            <figure className="image-frame">
              <ProductMockup screen="softphone" />
              <figcaption>
                Animated portal concept with illustrative extension data.
              </figcaption>
            </figure>
            <p>
              The phone belongs to the portal layout. Navigating between portal
              pages keeps registration and an active call; a mini phone offers
              answer, decline, mute and hangup on the other pages.
            </p>
            <Callout warning>
              <p>
                Reloading or closing the browser tab ends the call. Page-to-page
                portal navigation and a full browser reload are different
                operations.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "personal-tools",
        title: "A portal for your own calls",
        content: (
          <>
            <ul>
              <li>
                Inbound, outbound and missed call history, including one-click
                callback.
              </li>
              <li>
                Recordings of calls you participated in, where the admin has
                allowed listening. The portal offers listening, not an admin
                download control.
              </li>
              <li>
                Voicemail inbox with caller ID, playback, read state and delete.
              </li>
              <li>No-answer, busy and unavailable forwarding, plus DND.</li>
              <li>Directory presence and notifications for incoming calls.</li>
            </ul>
            <p>
              A browser and desk phone can ring for the same extension. The
              first device to answer keeps the call.
            </p>
          </>
        ),
      },
      {
        id: "requirements",
        title: "HTTPS, microphone and media",
        content: (
          <>
            <p>
              The microphone requires a secure HTTPS context and browser
              permission. SIP signalling runs over WSS, while WebRTC media uses
              DTLS-SRTP. Remote networks may need the configured TURN/TURNS
              relay.
            </p>
            <p>
              Permission to use the microphone does not configure the server
              firewall. Test registration and bidirectional audio separately,
              including from outside the office network.
            </p>
          </>
        ),
      },
      {
        id: "mobile",
        title: "Understand mobile background behavior",
        content: (
          <>
            <p>
              Mobile browsers may suspend tabs when backgrounded or when the
              screen is off, so inbound browser calls are unreliable in that
              state. If mobile reachability is essential, use a compatible
              native SIP softphone with QR provisioning and validate its
              behavior on your devices.
            </p>
            <p>
              MunaSIP does not provide a first-party mobile or desktop app. It
              does provide documented provisioning profiles for Yealink, Fanvil
              and Grandstream desk phones.
            </p>
          </>
        ),
      },
    ],
  },
  voicemail: {
    title: "Every message, in reach.",
    summary:
      "Send unanswered calls to an extension's mailbox, then listen and manage messages from the employee portal. Available in v1.7.5.",
    source: "USER-PORTAL",
    sections: [
      {
        id: "routing",
        title: "Give unanswered calls a destination",
        content: (
          <>
            <p>
              Choose voicemail as a destination in your call flow or extension
              forwarding. No-answer, busy and unavailable forwarding are
              separate rules, so you can choose how each case is handled.
            </p>
            <p>
              Extension permissions still apply. Forwarding to a mobile or
              external number requires the administrator to allow that
              destination.
            </p>
            <Link className="text-link" href="/docs/ivr/">
              Connect a voicemail step in your IVR →
            </Link>
          </>
        ),
      },
      {
        id: "inbox",
        title: "Open your own voicemail inbox",
        content: (
          <>
            <p>
              Sign in with your extension number and open Voicemail. The v
              {site.version} portal lists the caller and message time,
              identifies unread messages, and opens a player when you select a
              message.
            </p>
            <figure className="image-frame">
              <ProductMockup screen="voicemail" />
              <figcaption>
                Illustrative mailbox with sample callers. Playback here is an
                animation, not live audio.
              </figcaption>
            </figure>
            <ol>
              <li>Select a message to open its player and mark it read.</li>
              <li>
                Listen in the portal; the mailbox belongs to the signed-in
                extension.
              </li>
              <li>
                Use Delete and confirm when you want to remove the message.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: "recordings",
        title: "A mailbox is different from call recordings",
        content: (
          <>
            <p>
              Voicemail is a message left for an extension. Call recordings are
              recordings of conversations the employee participated in, subject
              to the administrator's listening permissions. The portal's
              call-recording player is listen-only.
            </p>
            <p>
              Back up the persistent data and recording storage together.
              Recreating a container with its existing volume preserves state;
              deleting the volume does not.
            </p>
          </>
        ),
      },
      {
        id: "development",
        title: "Follow the next portal improvements",
        content: (
          <>
            <p>
              The main branch adds inline waveforms, unheard counts and saved
              voicemail greetings. These post-release changes are tracked
              separately from the v{site.version} snapshot used by these guides.
            </p>
            <Link className="text-link" href="/updates/#main-work">
              See what is in development →
            </Link>
          </>
        ),
      },
    ],
  },
  integrations: {
    title: "Make the right connections.",
    summary:
      "Bring call events into your tools, originate calls from your workflow and use your own data in an IVR.",
    source: "API",
    sections: [
      {
        id: "surfaces",
        title: "Choose the right API surface",
        content: (
          <>
            <p>
              MunaSIP separates the session-authenticated admin API,
              extension-authenticated portal API and API-key-authenticated
              integration API. External integrations use{" "}
              <code>/api/v1/ext</code>.
            </p>
            <Table
              headings={["Integration endpoint", "Purpose"]}
              rows={[
                [
                  "POST /api/v1/ext/calls/originate",
                  "Click-to-call: ring an extension first, then dial the destination.",
                ],
                ["GET /api/v1/ext/cdr", "Read call detail records."],
                [
                  "GET /api/v1/ext/recordings/:id/stream",
                  "Stream a recording with the required key permissions.",
                ],
              ]}
            />
            <p>
              Create and manage API keys in Admin → Integrations. Follow the{" "}
              <a href={sourceDoc("API")}>upstream API contract</a> and current
              application schemas for authentication, permissions and request
              bodies.
            </p>
          </>
        ),
      },
      {
        id: "webhooks",
        title: "Let your tools know what happened",
        content: (
          <>
            <p>
              Webhook events cover ringing, answered, ended and missed calls.
              The project documents HMAC-signed bodies and three retries. Use
              the configured webhook secret to verify authenticity in your
              receiver and make event processing safe to repeat.
            </p>
            <CodeBlock
              code={"call.ringing\ncall.answered\ncall.ended\ncall.missed"}
              title="webhook events"
            />
            <p>
              For example, your own CRM integration could open the caller’s
              record on a ringing event. This is an integration pattern, not a
              bundled CRM connector.
            </p>
          </>
        ),
      },
      {
        id: "ivr-lookups",
        title: "Use your data inside the IVR",
        content: (
          <>
            <p>
              An API request node can look up a customer, map response fields to
              variables and choose the next destination. Keep API credentials in
              encrypted Settings → Secrets. Provide an error route for failed,
              slow or malformed responses.
            </p>
            <p>
              Pair a short announcement with a lookup so the caller understands
              the pause. Simulate with mock data before connecting a real
              endpoint. See{" "}
              <Link href="/docs/ivr/#api-node">the IVR guide</Link> for request
              methods, mapping and timeout behavior.
            </p>
          </>
        ),
      },
      {
        id: "widget",
        title: "Put a call button on your website",
        content: (
          <>
            <p>
              In Admin → Integrations, create a website call widget and copy the
              generated embed. It uses browser WebRTC calling and supports an
              optional callback form.
            </p>
            <CodeBlock
              code={
                '<!-- Example shape: use the actual embed generated by your PBX. -->\n<script\n  src="https://pbx.example.com/widget.js"\n  data-widget="YOUR_GENERATED_WIDGET_ID">\n</script>'
              }
              title="website widget"
              language="html"
            />
            <p>
              The widget’s media connection still needs your PBX’s HTTPS, WSS
              and RTP/TURN setup. This product site does not embed a live widget
              or request microphone permission.
            </p>
          </>
        ),
      },
      {
        id: "operations",
        title: "Connect deliberately",
        content: (
          <>
            <ul>
              <li>
                Issue separate keys for separate integrations and grant only the
                access each needs.
              </li>
              <li>
                Keep keys and webhook secrets on a trusted server, outside
                publicly shipped browser code.
              </li>
              <li>
                Use HTTPS and avoid exposing internal admin APIs as public
                integration endpoints.
              </li>
              <li>
                Test failure paths and retries with your own receiver before
                enabling business workflows.
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
  security: {
    title: "Your server. Your responsibility.",
    summary:
      "Understand the documented controls, configure access deliberately and plan how you will recover your phone system.",
    source: "SERVER-SECURITY",
    sections: [
      {
        id: "access",
        title: "Start with access",
        content: (
          <>
            <p>
              MunaSIP provides optional admin TOTP two-factor authentication,
              admin/portal/SIP IP allowlists, login-flood bans, SIP scanning
              visibility, audit logging and outbound dialing controls. Enable
              and configure the controls your deployment needs.
            </p>
            <p>
              Change all lab credentials, restrict administrative access and
              review the provider’s outbound country and spend limits. Toll
              fraud is a practical risk when an extension is compromised.
            </p>
            <Callout>
              <p>
                Some older security notes describe admin 2FA as mandatory and
                SIP secrets as hidden random values. Current authentication code
                makes TOTP optional, and current extensions use a shared
                portal/SIP password. This guide follows the current
                implementation.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "network",
        title: "Keep the network boundary small",
        content: (
          <>
            <p>
              Use trusted HTTPS for the panel and WSS. The Compose stack
              supports automatic Let’s Encrypt HTTP-01 certificates from
              Settings; TCP port 80 must reach the server for challenges.
              Protect SIP/RTP with office, VPN and provider access rules.
            </p>
            <p>
              Do not publish ARI, AMI or PostgreSQL to the internet. TURN/TURNS
              and RTP requirements depend on the actual remote clients and
              network edge. Disable SIP ALG when it interferes with office
              phones.
            </p>
            <p>
              WebRTC media uses DTLS-SRTP. Do not infer end-to-end encryption or
              universal encryption for every SIP trunk or desk phone: transport
              and media security depend on endpoint and provider configuration.
            </p>
          </>
        ),
      },
      {
        id: "privacy",
        title: "Know where data goes",
        content: (
          <>
            <p>
              CDR and recordings are stored on your infrastructure.
              Role-specific access, recording announcements, retention settings
              and access auditing support your own privacy process; they do not
              by themselves establish legal compliance.
            </p>
            <p>
              API lookups and webhooks send data to the destinations you
              configure. Edge Neural speech needs an external online service
              during synthesis. EMA offers offline Turkish speech; offline
              English is not available.
            </p>
            <p>
              Tell employees and callers about recording as appropriate to your
              use. Configure recording policy and retention deliberately. Review{" "}
              <a href={sourceDoc("TTS")}>the speech engine documentation</a>{" "}
              before choosing which prompt data to send to an online engine.
            </p>
          </>
        ),
      },
      {
        id: "backup",
        title: "Persist, back up, restore",
        content: (
          <>
            <p>
              For the single image, persist <code>/data</code> and protect{" "}
              <code>/data/.munasip-secrets</code>. Compose uses separate
              database, recording, upload and Asterisk configuration volumes,
              plus certificate files. Keep encryption keys with your recovery
              material.
            </p>
            <p>
              The project includes JSON backup/restore and recording archive
              options for a mounted path or SFTP. An application export is not a
              replacement for a complete database and media recovery plan. Test
              a restore on a separate host.
            </p>
            <p>
              Plan recording disk usage around real traffic and retention. If
              the host or uplink fails, inbound failover to a mobile number is a
              carrier-side configuration; automatic clustered failover is not a
              documented MunaSIP feature.
            </p>
          </>
        ),
      },
      {
        id: "maintenance",
        title: "Updates and responsible reporting",
        content: (
          <>
            <p>
              Pin an image version when you want controlled upgrades. Read the
              release notes, back up, recreate the service with its existing
              volumes and verify calling after the update.
            </p>
            <p>
              MIT permits forks, modification and redistribution with its
              copyright notice. Visit the official repository for current
              development, contribution and security-reporting information.
              Review the available private reporting options before sharing
              vulnerability details publicly.
            </p>
            <p>
              Read the{" "}
              <a href="https://github.com/MunaSIP/MunaSIP#readme">
                project readme
              </a>{" "}
              and <a href={sourceDoc("DEPLOY-VPS")}>VPS deployment guide</a> for
              current upstream instructions.
            </p>
          </>
        ),
      },
    ],
  },
};
