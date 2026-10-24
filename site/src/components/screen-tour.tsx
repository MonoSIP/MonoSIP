"use client";

import { useRef, useState } from "react";
import { Icon } from "./icon";
import { ProductMockup, type MockupScreen } from "./product-mockup";
import { site } from "@/lib/site";

const screens: {
  name: string;
  file: MockupScreen;
  icon: string;
  title: string;
  text: string;
  alt: string;
}[] = [
  {
    name: "Live dashboard",
    file: "dashboard",
    icon: "chart",
    title: "The whole office, at a glance.",
    text: "See active calls, extension presence and queue activity in one live view. Switch to TV mode for the team.",
    alt: "MunaSIP dashboard showing call counts, live extension presence and queues",
  },
  {
    name: "Visual IVR",
    file: "ivr-designer",
    icon: "flow",
    title: "A clear path for every caller.",
    text: "Connect menus, API requests, conditions and destinations. Validate, simulate and publish your call flow.",
    alt: "MunaSIP visual IVR designer with the Main line demo, a menu, API lookup and conditional routes",
  },
  {
    name: "Call logs",
    file: "cdr",
    icon: "phone",
    title: "Follow the whole conversation.",
    text: "Open a call row to inspect its IVR timeline. Filter records, export CSV and find the associated recording.",
    alt: "MunaSIP call detail records with filters, call direction and recording controls",
  },
  {
    name: "Voicemail",
    file: "voicemail",
    icon: "sound",
    title: "Miss the call. Keep the message.",
    text: `Open your extension’s mailbox, see who called, listen to the message and manage its read state. Included in v${site.version}.`,
    alt: "MunaSIP employee voicemail inbox with caller details, unread messages and a playback panel",
  },
  {
    name: "Queues",
    file: "queues",
    icon: "users",
    title: "Give your team room to answer.",
    text: "Choose a ring strategy, manage members and configure wait announcements, overflow and callback.",
    alt: "MunaSIP queue management with members and routing configuration",
  },
  {
    name: "Extensions",
    file: "extensions",
    icon: "network",
    title: "A place for every desk.",
    text: "Manage extension permissions, forwarding, caller IDs and shared portal/SIP passwords. Import or export CSV.",
    alt: "MunaSIP extensions management showing office extensions and presence",
  },
  {
    name: "Reports",
    file: "reports",
    icon: "chart",
    title: "See what the day sounded like.",
    text: "Review answered, missed and abandoned calls, with wait and talk times by queue or extension.",
    alt: "MunaSIP reporting screen with date filters and call statistics",
  },
  {
    name: "Settings & SSL",
    file: "settings",
    icon: "shield",
    title: "Your system. Your settings.",
    text: "Set the public hostname, manage security options and configure automatic Let’s Encrypt certificates.",
    alt: "MunaSIP system settings including hostname and automatic SSL configuration",
  },
];

export function ScreenTour() {
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const screen = screens[selected];
  return (
    <div className="screen-tour">
      <div className="tour-sidebar">
        <div className="tour-sidebar-label mono">THE CONTROL ROOM</div>
        <div
          role="tablist"
          aria-label="Explore product screens"
          className="screen-tabs"
          aria-orientation="vertical"
        >
          {screens.map((item, i) => (
            <button
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`screen-tab-${i}`}
              key={item.file}
              aria-controls="screen-panel"
              aria-selected={selected === i}
              tabIndex={selected === i ? 0 : -1}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === "ArrowDown" || event.key === "ArrowRight")
                  next = (i + 1) % screens.length;
                else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
                  next = (i - 1 + screens.length) % screens.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = screens.length - 1;
                else return;
                event.preventDefault();
                setSelected(next);
                buttons.current[next]?.focus();
              }}
            >
              <Icon name={item.icon} />
              <span>{item.name}</span>
              <Icon name="arrow" className="tab-arrow" />
            </button>
          ))}
        </div>
        <div className="screen-caption">
          <span className="status-dot" /> A closer look, in motion.
          <br />
          <span>Illustrative interface mockups.</span>
        </div>
      </div>
      <div
        role="tabpanel"
        tabIndex={0}
        id="screen-panel"
        aria-labelledby={`screen-tab-${selected}`}
        className="tour-panel"
      >
        <div className="browser-bar">
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          <span>
            <Icon name="shield" /> your-pbx / admin / {screen.file}
          </span>
          <span className="screen-version">INTERFACE CONCEPT</span>
        </div>
        <ProductMockup
          key={screen.file}
          screen={screen.file}
          label={`${screen.alt} — illustrative animated mockup`}
        />
        <div className="tour-panel-caption">
          <div>
            <h3>{screen.title}</h3>
            <p>{screen.text}</p>
          </div>
          <span className="mono">
            0{selected + 1} / 0{screens.length}
          </span>
        </div>
      </div>
    </div>
  );
}
