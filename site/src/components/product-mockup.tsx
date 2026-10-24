import type { ReactNode } from "react";
import { MotionRegion } from "./background";

export type MockupScreen =
  | "dashboard"
  | "ivr-designer"
  | "cdr"
  | "voicemail"
  | "queues"
  | "extensions"
  | "reports"
  | "settings"
  | "ivr-api-settings"
  | "softphone";

const titles: Record<MockupScreen, string> = {
  dashboard: "Live dashboard",
  "ivr-designer": "Visual IVR designer",
  cdr: "Call records",
  voicemail: "Your voicemail",
  queues: "Call queues",
  extensions: "Team extensions",
  reports: "Call reports",
  settings: "System & SSL",
  "ivr-api-settings": "API request node",
  softphone: "Browser softphone",
};

function Label({
  x,
  y,
  children,
  kind = "",
  size = 14,
}: {
  x: number;
  y: number;
  children: ReactNode;
  kind?: string;
  size?: number;
}) {
  return (
    <text x={x} y={y} fontSize={size} className={`mockup-text ${kind}`}>
      {children}
    </text>
  );
}

function Card({
  x,
  y,
  w,
  h,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="10" className="mockup-card" />
      {children}
    </g>
  );
}

function Pill({
  x,
  y,
  text,
  width = 104,
  tone = "accent",
}: {
  x: number;
  y: number;
  text: string;
  width?: number;
  tone?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={width}
        height="28"
        rx="14"
        className={`mockup-pill ${tone}`}
      />
      <Label x={12} y={19} size={11} kind={tone}>
        {text}
      </Label>
    </g>
  );
}

function Wave({ x, y, count = 32 }: { x: number; y: number; count?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="mockup-waveform">
      {Array.from({ length: count }, (_, i) => {
        const h = 20 + ((i * 17 + 11) % 43);
        return (
          <rect
            key={i}
            x={i * 9}
            y={-h / 2}
            width="5"
            height={h}
            rx="2"
            className="mockup-wave mockup-motion"
            style={{
              animationDelay: `${i * -0.19}s`,
              animationDuration: `${0.72 + (i % 5) * 0.09}s`,
            }}
          />
        );
      })}
    </g>
  );
}

function Metrics({ report = false }: { report?: boolean }) {
  return (
    <g>
      {(report
        ? [
            ["Total calls", "1,284", "+12.8% this week"],
            ["Answered", "96.4%", "A little more connected"],
            ["Avg. wait", "00:18", "Across all queues"],
            ["Talk time", "04:32", "Average conversation"],
          ]
        : [
            ["Active calls", "08", "4 inbound · 4 outbound"],
            ["Available team", "12", "16 extensions online"],
            ["Calls today", "186", "+18% from yesterday"],
            ["Service level", "98.2%", "Answered within 30s"],
          ]
      ).map(([name, value, note], i) => (
        <Card key={name} x={202 + i * 222} y={125} w={204} h={110}>
          <Label x={18} y={28} kind="muted" size={12}>
            {name}
          </Label>
          <Label x={18} y={66} kind="strong" size={32}>
            {value}
          </Label>
          <Label x={18} y={91} kind="muted" size={10}>
            {note}
          </Label>
          {i === 0 && (
            <circle
              cx="177"
              cy="25"
              r="4"
              className="mockup-beacon mockup-motion"
            />
          )}
        </Card>
      ))}
    </g>
  );
}

function Chart({
  x = 202,
  y = 255,
  w = 545,
  report = false,
}: {
  x?: number;
  y?: number;
  w?: number;
  report?: boolean;
}) {
  return (
    <Card x={x} y={y} w={w} h={246}>
      <Label x={22} y={32} kind="strong">
        {report ? "Conversations this week" : "Call activity"}
      </Label>
      <Label x={22} y={54} kind="muted" size={11}>
        {report
          ? "Answered and missed · daily totals"
          : "Inbound and outbound · today"}
      </Label>
      {[85, 125, 165, 205].map((yy) => (
        <path key={yy} d={`M22 ${yy}H${w - 22}`} className="mockup-grid" />
      ))}
      <g transform={`translate(22 0) scale(${(w - 44) / 500} 1)`}>
        <path
          d="M0 178C25 178 28 132 55 142S95 191 120 158S150 172 180 115S215 151 245 114S270 157 300 103S330 135 365 82S405 128 435 92S475 115 500 72V205H0Z"
          className="mockup-chart-area"
        />
        <path
          d="M0 178C25 178 28 132 55 142S95 191 120 158S150 172 180 115S215 151 245 114S270 157 300 103S330 135 365 82S405 128 435 92S475 115 500 72"
          className="mockup-chart-line"
        />
        <path
          d="M0 195Q40 162 80 184T160 177T240 157T320 169T400 145T500 139"
          className="mockup-chart-secondary"
        />
        <circle
          cx="365"
          cy="82"
          r="5"
          className="mockup-beacon mockup-motion"
        />
      </g>
      {["09:00", "12:00", "15:00", "18:00"].map((t, i) => (
        <Label
          key={t}
          x={22 + (i * (w - 80)) / 3}
          y={229}
          kind="muted"
          size={10}
        >
          {t}
        </Label>
      ))}
    </Card>
  );
}

function Dashboard() {
  return (
    <>
      <Metrics />
      <Chart />
      <Card x={767} y={255} w={305} h={246}>
        <Label x={20} y={32} kind="strong">
          On the line
        </Label>
        <Pill x={211} y={14} text="LIVE" width={74} />
        {[
          ["201", "Maya Chen", "Sales · incoming"],
          ["204", "Alex Morgan", "Support · incoming"],
          ["108", "Sam Taylor", "Outbound"],
        ].map(([ext, name, detail], i) => (
          <g key={ext} transform={`translate(20 ${74 + i * 57})`}>
            <circle cx="17" cy="0" r="17" className="mockup-avatar" />
            <Label x={6} y={4} size={10} kind="accent">
              {ext}
            </Label>
            <Label x={44} y={-2} size={13}>
              {name}
            </Label>
            <Label x={44} y={16} kind="muted" size={10}>
              {detail}
            </Label>
            <circle
              cx="258"
              cy="0"
              r="4"
              className="mockup-beacon mockup-motion"
            />
          </g>
        ))}
      </Card>
      <Card x={202} y={521} w={870} h={122}>
        <Label x={22} y={30} kind="strong">
          Your queues
        </Label>
        {["Sales", "Customer care", "Technical support"].map((name, i) => (
          <g key={name} transform={`translate(${22 + i * 286} 56)`}>
            <Label x={0} y={0} size={12}>
              {name}
            </Label>
            <Label x={0} y={23} size={10} kind="muted">
              {i + 3} agents available
            </Label>
            <rect
              x="0"
              y="36"
              width="245"
              height="4"
              rx="2"
              className="mockup-track"
            />
            <rect
              x="0"
              y="36"
              width={175 + i * 25}
              height="4"
              rx="2"
              className="mockup-meter mockup-motion"
            />
          </g>
        ))}
      </Card>
    </>
  );
}

function FlowNode({
  x,
  y,
  title,
  subtitle,
  mark,
}: {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  mark: string;
}) {
  return (
    <Card x={x} y={y} w={210} h={94}>
      <rect
        x="14"
        y="16"
        width="30"
        height="30"
        rx="7"
        className="mockup-avatar"
      />
      <Label x={23} y={37} kind="accent" size={17}>
        {mark}
      </Label>
      <Label x={56} y={29} kind="strong" size={13}>
        {title}
      </Label>
      <Label x={16} y={69} kind="muted" size={11}>
        {subtitle}
      </Label>
      <circle cx="0" cy="47" r="4" className="mockup-port" />
      <circle cx="210" cy="47" r="4" className="mockup-port" />
    </Card>
  );
}

function Flow() {
  const routes = [
    "M254 247H295Q320 247 320 222V152Q320 127 345 127H382",
    "M254 247H382",
    "M592 247H596Q606 247 606 272V352Q606 377 620 377",
    "M592 127H740V330",
  ];
  return (
    <>
      <Card x={202} y={125} w={870} h={518}>
        {Array.from({ length: 18 }, (_, i) => (
          <path
            key={i}
            d={`M${i * 50 + 16} 0V518${i < 11 ? `M0 ${i * 50 + 16}H870` : ""}`}
            className="mockup-grid mockup-canvas-grid"
          />
        ))}
        <Label x={24} y={32} kind="muted" size={12}>
          MAIN LINE / PUBLISHED FLOW
        </Label>
        <Pill x={714} y={16} text="Validated" width={130} />
        <g className="mockup-wires">
          {routes.map((route) => (
            <path key={route} d={route} />
          ))}
        </g>
        <g className="mockup-flow mockup-motion">
          {routes.map((route) => (
            <path key={route} d={route} />
          ))}
        </g>
        <g className="mockup-packets">
          {routes.map((route, i) => (
            <path
              key={route}
              d={route}
              pathLength={100}
              className="mockup-packet mockup-motion"
              style={{
                animationDelay: `${i * -0.7}s`,
                animationDuration: `${2.4 + i * 0.3}s`,
              }}
            />
          ))}
        </g>
        <FlowNode
          x={44}
          y={200}
          title="Welcome menu"
          subtitle="How can we help today?"
          mark="♪"
        />
        <FlowNode
          x={382}
          y={80}
          title="Sales"
          subtitle="Press 1 · ring extension 201"
          mark="↗"
        />
        <FlowNode
          x={382}
          y={200}
          title="Customer lookup"
          subtitle="Press 2 · GET /customer"
          mark="⌘"
        />
        <FlowNode
          x={620}
          y={330}
          title="Support queue"
          subtitle="Connect to the right team"
          mark="↗"
        />
        <Pill x={278} y={99} text="1 · Sales" width={88} />
        <Pill x={275} y={263} text="2 · Support" width={106} />
        <Label x={24} y={486} size={11} kind="muted">
          4 connected steps · every exit has a destination
        </Label>
        <circle
          cx="825"
          cy="481"
          r="5"
          className="mockup-beacon mockup-motion"
        />
      </Card>
    </>
  );
}

const people = [
  "Maya Chen",
  "Alex Morgan",
  "Sam Taylor",
  "Jordan Lee",
  "Riley Parker",
  "Casey Adams",
];

function Records({ extensions = false }: { extensions?: boolean }) {
  return (
    <>
      <Card x={202} y={125} w={870} h={394}>
        <Label x={22} y={34} kind="strong">
          {extensions ? "Office directory" : "Today's conversations"}
        </Label>
        <Pill
          x={710}
          y={17}
          text={extensions ? "+ Extension" : "Export CSV"}
          width={138}
        />
        {[
          "Name / extension",
          extensions ? "Presence" : "Direction",
          extensions ? "Department" : "Duration",
          extensions ? "Forwarding" : "Result",
        ].map((v, i) => (
          <Label key={v} x={22 + i * 212} y={78} kind="muted" size={11}>
            {v}
          </Label>
        ))}
        {people.map((name, i) => (
          <g key={name} transform={`translate(0 ${107 + i * 46})`}>
            <path d="M20 26H850" className="mockup-grid" />
            <circle cx="36" cy="0" r="14" className="mockup-avatar" />
            <Label x={27} y={4} size={10} kind="accent">
              {name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </Label>
            <Label x={60} y={4} size={12}>
              {name}
            </Label>
            <Label
              x={234}
              y={4}
              size={12}
              kind={i === 2 ? "warning" : "accent"}
            >
              {extensions
                ? i === 2
                  ? "On a call"
                  : "Available"
                : i % 2
                  ? "↗ Outbound"
                  : "↙ Inbound"}
            </Label>
            <Label x={446} y={4} size={12}>
              {extensions
                ? i % 2
                  ? "Support"
                  : "Sales"
                : `0${i + 1}:${28 + i * 3}`}
            </Label>
            <Pill
              x={658}
              y={-16}
              text={
                extensions ? (i === 3 ? "Voicemail" : "Disabled") : "Answered"
              }
              tone={extensions ? "muted" : "accent"}
            />
          </g>
        ))}
      </Card>
      <Card x={202} y={539} w={870} h={104}>
        <Label x={22} y={30} kind="strong">
          {extensions
            ? "Presence, in real time."
            : "A conversation worth keeping."}
        </Label>
        <Label x={22} y={55} kind="muted" size={12}>
          {extensions
            ? "Your desk phone and browser, on the same extension."
            : "Call recording · Maya Chen · 03:42"}
        </Label>
        {extensions ? (
          <g>
            <Pill x={620} y={36} text="SIP registered" width={150} />
            <circle
              cx="808"
              cy="50"
              r="7"
              className="mockup-beacon mockup-motion"
            />
          </g>
        ) : (
          <Wave x={532} y={54} />
        )}
      </Card>
    </>
  );
}

function Queues() {
  return (
    <>
      <Card x={202} y={125} w={340} h={518}>
        <Label x={22} y={34} kind="strong">
          Support queue
        </Label>
        <Label x={22} y={57} kind="muted" size={12}>
          Every caller has a place.
        </Label>
        <circle cx="170" cy="204" r="90" className="mockup-ring-track" />
        <circle
          cx="170"
          cy="204"
          r="90"
          className="mockup-ring mockup-motion"
        />
        <Label x={146} y={209} size={42} kind="strong">
          03
        </Label>
        <Label x={126} y={237} size={12} kind="muted">
          callers waiting
        </Label>
        <Pill x={89} y={327} text="Avg. wait 00:18" width={162} />
        <Label x={22} y={409} kind="muted" size={12}>
          RING STRATEGY
        </Label>
        <Label x={22} y={440} kind="strong" size={20}>
          Least recent
        </Label>
        <Label x={22} y={470} kind="muted" size={12}>
          Give every agent room to answer.
        </Label>
      </Card>
      <Card x={562} y={125} w={510} h={518}>
        <Label x={22} y={34} kind="strong">
          The team on this queue
        </Label>
        <Pill x={358} y={17} text="4 available" width={130} />
        {people.slice(0, 5).map((name, i) => (
          <g key={name} transform={`translate(22 ${94 + i * 72})`}>
            <circle cx="19" cy="0" r="19" className="mockup-avatar" />
            <Label x={9} y={5} size={12} kind="accent">
              {name[0]}
            </Label>
            <Label x={54} y={-3} size={14}>
              {name}
            </Label>
            <Label x={54} y={18} size={11} kind="muted">
              Extension {201 + i}
            </Label>
            <Pill
              x={328}
              y={-16}
              text={i === 2 ? "On a call" : "Available"}
              tone={i === 2 ? "warning" : "accent"}
              width={138}
            />
          </g>
        ))}
        <Label x={22} y={483} kind="muted" size={11}>
          Position announcements · callback enabled
        </Label>
      </Card>
    </>
  );
}

function Reports() {
  return (
    <>
      <Metrics report />
      <Chart w={420} report />
      <Card x={642} y={255} w={430} h={246}>
        <Label x={22} y={32} kind="strong">
          Calls by queue
        </Label>
        <Label x={22} y={54} kind="muted" size={11}>
          A little perspective on the week.
        </Label>
        {[90, 138, 112, 167, 151, 104, 62].map((h, i) => (
          <g key={i} transform={`translate(${32 + i * 54} 205)`}>
            <rect
              width="26"
              height={h}
              y={-h}
              rx="4"
              className="mockup-bar mockup-motion"
              style={{ animationDelay: `${i * -0.4}s` }}
            />
            <Label x={2} y={23} size={10} kind="muted">
              {["M", "T", "W", "T", "F", "S", "S"][i]}
            </Label>
          </g>
        ))}
      </Card>
      <Card x={202} y={521} w={870} h={122}>
        <Label x={22} y={32} kind="strong">
          More answered. Less waiting.
        </Label>
        <Label x={22} y={58} kind="muted" size={12}>
          Compare queue performance, talk time and missed conversations.
        </Label>
        <Pill x={22} y={77} text="Last 7 days" width={120} />
        <Pill x={158} y={77} text="All queues" width={120} />
        <Label x={654} y={70} kind="accent" size={32}>
          96.4%
        </Label>
        <Label x={654} y={94} kind="muted" size={11}>
          overall answer rate
        </Label>
      </Card>
    </>
  );
}

function Settings({ api = false }: { api?: boolean }) {
  const rows = api
    ? [
        ["Request method", "GET"],
        ["Endpoint", "https://api.example.com/customer"],
        ["Authentication", "Bearer token · configured"],
        ["Timeout", "3 seconds · one retry"],
      ]
    : [
        ["Public hostname", "pbx.example.com"],
        ["Timezone", "Europe / Istanbul"],
        ["Language", "English / Türkçe"],
        ["Certificate", "Automatic · Let’s Encrypt"],
      ];
  return (
    <>
      <Card x={202} y={125} w={530} h={518}>
        <Label x={24} y={36} kind="strong" size={19}>
          {api ? "Request configuration" : "The details, taken care of."}
        </Label>
        <Label x={24} y={62} kind="muted" size={12}>
          {api
            ? "Bring context into the conversation."
            : "One place to make it yours."}
        </Label>
        {rows.map(([name, value], i) => (
          <g key={name} transform={`translate(24 ${105 + i * 84})`}>
            <Label x={0} y={0} kind="muted" size={11}>
              {name}
            </Label>
            <rect
              y="14"
              width="482"
              height="42"
              rx="5"
              className="mockup-input"
            />
            <Label x={14} y={41} size={13}>
              {value}
            </Label>
          </g>
        ))}
        <Pill
          x={24}
          y={461}
          text={api ? "Test request" : "Save settings"}
          width={145}
        />
      </Card>
      <Card x={752} y={125} w={320} h={518}>
        <circle cx="160" cy="107" r="48" className="mockup-avatar" />
        <path
          d="M139 107L154 122L182 91"
          className="mockup-check mockup-motion"
        />
        <Label x={32} y={201} kind="strong" size={20}>
          {api ? "Response mapped." : "A secure connection."}
        </Label>
        <Label x={32} y={232} kind="muted" size={12}>
          {api
            ? "A useful answer. A clear next step."
            : "HTTPS · automatic certificate renewal"}
        </Label>
        {api ? (
          <g>
            <Label x={32} y={290} kind="accent" size={12}>
              200 OK · application/json
            </Label>
            {["{", '  "customer": true,', '  "agent": "201"', "}"].map(
              (s, i) => (
                <Label key={s} x={32} y={327 + i * 26} kind="code" size={14}>
                  {s}
                </Label>
              ),
            )}
          </g>
        ) : (
          <g>
            {[
              "Certificate valid",
              "Hostname verified",
              "Renewal configured",
            ].map((s, i) => (
              <g key={s}>
                <circle
                  cx="39"
                  cy={295 + i * 49}
                  r="4"
                  className="mockup-beacon mockup-motion"
                />
                <Label x={54} y={300 + i * 49} size={13}>
                  {s}
                </Label>
              </g>
            ))}
          </g>
        )}
        <Label x={32} y={484} kind="muted" size={10}>
          {api
            ? "Error exit → general support queue"
            : "Your phone system. Your infrastructure."}
        </Label>
      </Card>
    </>
  );
}

function Softphone() {
  return (
    <>
      <Card x={202} y={125} w={430} h={518}>
        <Label x={22} y={32} kind="strong">
          Your conversations
        </Label>
        <Pill x={282} y={15} text="Ext. 101" width={126} />
        {people.slice(0, 4).map((name, i) => (
          <g key={name} transform={`translate(22 ${95 + i * 81})`}>
            <circle cx="22" cy="0" r="22" className="mockup-avatar" />
            <Label x={12} y={5} size={14} kind="accent">
              {name[0]}
            </Label>
            <Label x={61} y={-3} size={15}>
              {name}
            </Label>
            <Label x={61} y={20} size={11} kind="muted">
              {i === 0
                ? "Connected · Sales"
                : `Extension ${201 + i} · Available`}
            </Label>
            <circle
              cx="371"
              cy="0"
              r="4"
              className="mockup-beacon mockup-motion"
            />
          </g>
        ))}
        <Label x={22} y={471} kind="muted" size={12}>
          Your extension. Any desk.
        </Label>
      </Card>
      <Card x={652} y={125} w={420} h={518}>
        <Pill x={137} y={22} text="CONNECTED" width={146} />
        <circle cx="210" cy="116" r="41" className="mockup-avatar" />
        <Label x={190} y={126} size={28} kind="accent">
          MC
        </Label>
        <Label x={144} y={189} size={23} kind="strong">
          Maya Chen
        </Label>
        <Label x={147} y={215} size={12} kind="muted">
          Extension 201 · 02:34
        </Label>
        <Wave x={101} y={255} count={25} />
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
          (n, i) => (
            <g
              key={n}
              transform={`translate(${134 + (i % 3) * 76} ${310 + Math.floor(i / 3) * 38})`}
            >
              <Label x={0} y={0} size={18}>
                {n}
              </Label>
            </g>
          ),
        )}
        {["Mute", "Hold", "Transfer"].map((s, i) => (
          <Pill
            key={s}
            x={38 + i * 118}
            y={449}
            text={s}
            width={108}
            tone="muted"
          />
        ))}
      </Card>
    </>
  );
}

function Voicemail() {
  return (
    <>
      <Card x={202} y={125} w={870} h={174}>
        <Pill x={22} y={18} text="MESSAGE OPEN" width={148} />
        <Label x={22} y={83} kind="strong" size={25}>
          +44 20 7946 0128
        </Label>
        <Label x={22} y={111} kind="muted" size={12}>
          Today, 10:24 · Extension 101
        </Label>
        <Wave x={487} y={81} count={36} />
        <Label x={487} y={130} kind="muted" size={11}>
          00:18 / 00:42 · Sample playback
        </Label>
        <Pill x={22} y={131} text="Read" width={78} />
        <Pill x={114} y={131} text="Delete message" width={154} tone="muted" />
      </Card>
      <Card x={202} y={319} w={870} h={324}>
        <Label x={22} y={36} kind="strong">
          Messages for your extension
        </Label>
        <Label x={22} y={62} kind="muted" size={12}>
          Select a caller to listen. Your messages stay with your PBX.
        </Label>
        {[
          ["+44 20 7946 0128", "Today, 10:24", "Read"],
          ["+44 20 7946 0186", "Today, 09:58", "Unread"],
          ["Maya Chen · 201", "Yesterday, 16:42", "Unread"],
        ].map(([caller, at, state], i) => (
          <g key={caller} transform={`translate(22 ${113 + i * 74})`}>
            <path d="M0 35H826" className="mockup-grid" />
            <circle cx="18" cy="0" r="18" className="mockup-avatar" />
            <Label x={9} y={5} kind="accent" size={15}>
              ♪
            </Label>
            <Label x={54} y={-2} size={15}>
              {caller}
            </Label>
            <Label x={54} y={20} kind="muted" size={11}>
              {at}
            </Label>
            <Pill
              x={698}
              y={-16}
              text={state}
              width={126}
              tone={state === "Unread" ? "accent" : "muted"}
            />
          </g>
        ))}
      </Card>
    </>
  );
}

export function ProductMockup({
  screen,
  label,
  phoneOnly = false,
}: {
  screen: MockupScreen;
  label?: string;
  phoneOnly?: boolean;
}) {
  const title = titles[screen];
  const nav = [
    "Overview",
    "Call flows",
    "Call records",
    "Voicemail",
    "Queues",
    "Extensions",
    "Reports",
    "Settings",
  ];
  const current = [
    "dashboard",
    "ivr-designer",
    "cdr",
    "voicemail",
    "queues",
    "extensions",
    "reports",
    "settings",
  ].indexOf(screen);
  const content: Record<MockupScreen, ReactNode> = {
    dashboard: <Dashboard />,
    "ivr-designer": <Flow />,
    cdr: <Records />,
    voicemail: <Voicemail />,
    queues: <Queues />,
    extensions: <Records extensions />,
    reports: <Reports />,
    settings: <Settings />,
    "ivr-api-settings": <Settings api />,
    softphone: <Softphone />,
  };
  return (
    <MotionRegion className="product-mockup">
      <svg
        viewBox={phoneOnly ? "638 110 448 548" : "0 0 1120 700"}
        width={phoneOnly ? 448 : 1120}
        height={phoneOnly ? 548 : 700}
        role="img"
        aria-label={
          label ??
          `Animated ${title.toLowerCase()} mockup with illustrative sample data`
        }
        data-screen={screen}
      >
        <title>{`${title} · MunaSIP interface illustration`}</title>
        <desc>
          An illustrative interface mockup, not a live phone system or a product
          screenshot.
        </desc>
        <rect width="1120" height="700" className="mockup-base" />
        <path d="M0 0H174V700H0Z" className="mockup-sidebar" />
        <path d="M174 0V700M174 78H1120" className="mockup-grid" />
        <rect
          x="24"
          y="26"
          width="26"
          height="26"
          rx="7"
          className="mockup-logo"
        />
        <path d="M31 44V34L37 40L43 34V44" className="mockup-logo-mark" />
        <Label x={61} y={45} size={20} kind="strong">
          MunaSIP
        </Label>
        <Label x={24} y={104} kind="muted" size={9}>
          YOUR PHONE SYSTEM
        </Label>
        {nav.map((name, i) => (
          <g key={name} transform={`translate(14 ${126 + i * 48})`}>
            {i === current && (
              <rect width="146" height="38" rx="6" className="mockup-avatar" />
            )}
            <rect
              x="12"
              y="13"
              width="11"
              height="11"
              rx="3"
              className={i === current ? "mockup-logo" : "mockup-nav-icon"}
            />
            <Label
              x={36}
              y={24}
              kind={i === current ? "accent" : "muted"}
              size={12}
            >
              {name}
            </Label>
          </g>
        ))}
        <circle
          cx="30"
          cy="655"
          r="4"
          className="mockup-beacon mockup-motion"
        />
        <Label x={43} y={660} size={10} kind="muted">
          All systems ready
        </Label>
        <Label x={202} y={35} kind="muted" size={10}>
          {screen === "softphone" || screen === "voicemail"
            ? "EMPLOYEE PORTAL"
            : "WORKSPACE / ADMIN"}
        </Label>
        <Label x={202} y={60} kind="strong" size={22}>
          {title}
        </Label>
        <Pill x={918} y={25} text="SAMPLE DATA" width={154} tone="muted" />
        {content[screen]}
        <Label x={202} y={677} kind="muted" size={10}>
          MunaSIP / A clearer connection.
        </Label>
        <Label x={919} y={677} kind="muted" size={9}>
          INTERFACE CONCEPT
        </Label>
      </svg>
    </MotionRegion>
  );
}
