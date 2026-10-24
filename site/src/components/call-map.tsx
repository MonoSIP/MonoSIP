"use client";

import { useState } from "react";
import { Icon } from "./icon";
import { MotionRegion } from "./background";

const routes = [
  {
    name: "Sales",
    target: "Extension 201",
    note: "The caller chooses Sales. The IVR transfers the call to extension 201.",
    icon: "phone",
  },
  {
    name: "Support",
    target: "Support queue",
    note: "The caller chooses Support. The queue rings an available team member.",
    icon: "headset",
  },
  {
    name: "After hours",
    target: "Voicemail",
    note: "A closed schedule sends the caller to a voicemail destination.",
    icon: "clock",
  },
];

export function CallMap() {
  const [route, setRoute] = useState(1);
  return (
    <MotionRegion className="hero-visual">
      <div className="visual-topline">
        <span>
          <span className="status-dot" /> YOUR CALL, CONNECTED.
        </span>
        <span>FIG. 01</span>
      </div>
      <div className="call-map">
        <svg
          viewBox="0 0 720 490"
          role="img"
          aria-labelledby="call-map-title call-map-desc"
        >
          <title id="call-map-title">A call through MunaSIP</title>
          <desc id="call-map-desc">
            An incoming SIP call enters Asterisk, follows an IVR or schedule and
            reaches {routes[route].target}. A conceptual illustration, not a
            live call.
          </desc>
          <defs>
            <pattern
              id="map-dots"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".18" />
            </pattern>
          </defs>
          <rect width="720" height="490" fill="url(#map-dots)" />
          <g fill="none" stroke="currentColor" className="map-guide">
            <circle cx="320" cy="245" r="145" />
            <circle cx="320" cy="245" r="166" />
            <path d="M154 245h332M320 79v332" />
            <path d="M40 28h22M40 28v22m618-22h22v22M40 440v22h22m618-22v22h-22" />
          </g>
          <path
            className="map-track"
            d="M128 245h101M412 245h72M555 190v-62h55M555 280v62h55"
          />
          <path className="map-signal signal" d="M128 245h101" />
          <path
            className="map-signal signal"
            d={
              route === 0
                ? "M412 245h72M555 190v-62h55"
                : route === 1
                  ? "M412 245h72M555 245h55"
                  : "M412 245h72M555 280v62h55"
            }
          />
          <g className="caller-node">
            <circle cx="90" cy="245" r="38" />
            <g
              transform="translate(76 231) scale(1.2)"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            >
              <path d="m6 3 4 5-3 3a15 15 0 0 0 6 6l3-3 5 4-2 3C10 23 1 14 3 5Z" />
            </g>
            <text x="90" y="310" textAnchor="middle">
              Incoming call
            </text>
            <text x="90" y="332" textAnchor="middle" className="diagram-detail">
              SIP provider
            </text>
          </g>
          <g className="pbx-core">
            <rect x="229" y="154" width="183" height="183" rx="12" />
            <rect
              x="241"
              y="166"
              width="159"
              height="159"
              rx="8"
              className="pbx-inner"
            />
            <image
              href="/brand/munasip-mark.svg"
              x="294"
              y="193"
              width="52"
              height="52"
            />
            <text x="320" y="277" textAnchor="middle" className="pbx-name">
              MunaSIP
            </text>
            <text
              x="320"
              y="301"
              textAnchor="middle"
              className="diagram-detail"
            >
              ASTERISK 22
            </text>
            <circle cx="320" cy="154" r="4" />
            <circle cx="412" cy="245" r="4" />
            <circle cx="229" cy="245" r="4" />
          </g>
          <g className="ivr-node">
            <rect x="484" y="201" width="114" height="88" rx="6" />
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="532" y="217" width="18" height="12" rx="2" />
              <path d="M541 229v9h-16v9m16-9h16v9m-37 0h10v8h-10zm32 0h10v8h-10z" />
            </g>
            <text x="541" y="279" textAnchor="middle">
              Call flow
            </text>
          </g>
          {routes.map((item, i) => (
            <g
              key={item.name}
              className={`destination ${route === i ? "chosen" : ""}`}
              transform={`translate(610 ${i === 0 ? 99 : i === 1 ? 216 : 313})`}
            >
              <rect width="94" height="58" rx="5" />
              <circle cx="14" cy="16" r="3" />
              <text x="47" y="39" textAnchor="middle">
                {i === 0 ? "201" : i === 1 ? "Queue" : "Voicemail"}
              </text>
            </g>
          ))}
          <g className="diagram-detail">
            <text x="320" y="404" textAnchor="middle">
              ONE PBX. YOUR INFRASTRUCTURE.
            </text>
            <path d="M252 423h136" stroke="currentColor" opacity=".3" />
          </g>
        </svg>
        <div className="route-stamp">
          <Icon name={routes[route].icon} />
          <span>{routes[route].target}</span>
          <span className="status-dot" />
        </div>
      </div>
      <div
        className="route-picker"
        role="group"
        aria-label="Choose an example call route"
      >
        {routes.map((item, i) => (
          <button
            type="button"
            key={item.name}
            aria-pressed={route === i}
            onClick={() => setRoute(i)}
          >
            <span className="route-number">0{i + 1}</span>
            {item.name}
            <Icon name="arrow" />
          </button>
        ))}
      </div>
      <p className="route-description" aria-live="polite">
        {routes[route].note}
      </p>
      <span className="illustration-note">
        Interactive illustration · no call is placed
      </span>
    </MotionRegion>
  );
}
