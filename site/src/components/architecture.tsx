import { MotionRegion } from "./background";
import { Icon } from "./icon";

export function Architecture() {
  return (
    <MotionRegion className="architecture-visual">
      <div className="architecture-label mono">
        <span className="status-dot" /> DOCKER COMPOSE · SERVICE MAP
      </div>
      <div className="architecture-clients">
        <span>
          <Icon name="monitor" /> Browser / portal
        </span>
        <span>
          <Icon name="phone" /> SIP phones / provider
        </span>
      </div>
      <svg
        className="architecture-connections"
        viewBox="0 0 600 84"
        role="img"
        aria-label="Browser HTTPS and WSS connect through nginx. SIP and RTP connect directly to Asterisk."
      >
        <path d="M150 0v65h150v19M450 0v84" />
        <path className="signal" d="M150 0v65h150v19M450 0v84" />
        <text x="165" y="28">
          HTTPS / WSS
        </text>
        <text x="465" y="54">
          SIP / RTP
        </text>
      </svg>
      <div className="architecture-host">
        <div className="host-label mono">
          <Icon name="server" /> YOUR LINUX SERVER
        </div>
        <div className="architecture-grid">
          <div className="service service-edge">
            <Icon name="network" />
            <strong>nginx</strong>
            <span>TLS · ACME · WSS</span>
          </div>
          <div className="service service-media">
            <Icon name="phone" />
            <strong>Asterisk 22</strong>
            <span>PJSIP · ARI · AMI</span>
          </div>
          <div className="service">
            <Icon name="monitor" />
            <strong>Web app</strong>
            <span>Admin + portal</span>
          </div>
          <div className="service service-control">
            <Icon name="flow" />
            <strong>Fastify API</strong>
            <span>Flows · config · jobs</span>
          </div>
          <div className="service">
            <Icon name="server" />
            <strong>PostgreSQL</strong>
            <span>Settings · CDR · flows</span>
          </div>
          <div className="service">
            <Icon name="sound" />
            <strong>Speech</strong>
            <span>Edge / EMA · embedded</span>
          </div>
        </div>
        <p className="architecture-footnote">
          API ↔ Asterisk over ARI / AMI · coturn relays remote WebRTC media.
        </p>
      </div>
      <div className="architecture-persistence">
        <Icon name="server" />
        <span>Persistent volumes</span>
        <span className="mono">database / recordings / config</span>
      </div>
    </MotionRegion>
  );
}
