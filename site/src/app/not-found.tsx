import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <div className="container not-found">
      <p className="eyebrow">404 / THIS LINE ISN’T CONNECTED</p>
      <h1>
        A missed connection.
        <br />
        <span>Let’s try another route.</span>
      </h1>
      <p>
        This page could not be found. Head home or pick up where you left off in
        the documentation.
      </p>
      <div className="button-row">
        <Link className="button primary" href="/">
          Back to home <Icon name="arrow" />
        </Link>
        <Link className="button secondary" href="/docs/">
          Documentation
        </Link>
      </div>
    </div>
  );
}
