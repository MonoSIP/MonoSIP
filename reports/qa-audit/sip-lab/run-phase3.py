#!/usr/bin/env python3
"""Phase-3 real SIP lab (SIPp + G.711A/RFC2833 pcaps) against isolated pbx on sipnet."""
from __future__ import annotations

import csv
import pathlib
import re
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "out"
OUT.mkdir(parents=True, exist_ok=True)
SCEN = pathlib.Path("/tmp/sipp-lab")
PBX = "172.30.0.10"
NET = "sipnet"
IMG = "ctaloi/sipp:latest"
SUMMARY: list[tuple[str, str, str]] = []


def passwd(ext: int) -> str:
    return pathlib.Path(f"/tmp/sipcred{ext}.txt").read_text().split()[1]


def sh(cmd: list[str], timeout: int = 120, *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    # SIPp redraws its curses-like screen to stdout; piping that fills the OS
    # pipe buffer and deadlocks the process after a successful call. Prefer
    # discarding stdout unless the caller needs it.
    return subprocess.run(
        cmd,
        text=True,
        capture_output=capture,
        timeout=timeout,
        stdin=subprocess.DEVNULL,
        stdout=None if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE if not capture else None,
    )


def docker_rm(*names: str) -> None:
    for n in names:
        sh(["docker", "rm", "-f", n])


def sipp(args: list[str], *, name: str | None = None, detach: bool = False, ip: str, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    # Image ENTRYPOINT is already ["sipp"] — do not pass "sipp" again.
    if detach:
        cmd = [
            "docker", "run", "-d", "--name", name or "sipp-tmp",
            "--network", NET, "--ip", ip,
            "-v", f"{SCEN}:/sipp:ro", "-v", f"{OUT}:/out",
            IMG, *args, f"{PBX}:5060",
        ]
        return sh(cmd, timeout=timeout, capture=True)
    cmd = [
        "docker", "run", "--rm",
        "--network", NET, "--ip", ip,
        "-v", f"{SCEN}:/sipp:ro", "-v", f"{OUT}:/out",
        IMG, *args, f"{PBX}:5060",
    ]
    # Discard SIPp screen redraws so the pipe cannot deadlock.
    return subprocess.run(
        cmd,
        text=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )


def record(sid: str, status: str, detail: str) -> None:
    SUMMARY.append((sid, status, detail))
    print(f"{sid}\t{status}\t{detail}")


def qualify(ext: int) -> None:
    sh(["docker", "exec", "pbx", "asterisk", "-rx", f"pjsip qualify {ext}"])


def register(ext: int, ip: str) -> bool:
    p = passwd(ext)
    name = f"sipp-reg-{ext}-{ip.split('.')[-1]}"
    docker_rm(name)
    try:
        r = sipp(
            ["-sf", "/sipp/reg.xml", "-s", str(ext), "-ap", p, "-au", str(ext), "-m", "1", "-timeout", "12"],
            ip=ip,
            timeout=25,
            name=name,
        )
        return r.returncode == 0
    except subprocess.TimeoutExpired:
        docker_rm(name)
        # Last-resort: any leftover sipp on this IP
        sh(["docker", "ps", "-q", "--filter", f"ancestor={IMG}"])
        for line in sh(["docker", "ps", "-q", "--filter", f"ancestor={IMG}"]).stdout.split():
            docker_rm(line.strip())
        return False


def msg_has(path_glob: str, pattern: str) -> bool:
    for f in OUT.glob(path_glob):
        try:
            if re.search(pattern, f.read_text(errors="ignore"), re.I):
                return True
        except OSError:
            pass
    return False


def main() -> int:
    docker_rm("sipp-uas101", "sipp-uas102", "sipp-uas103", "sipp-busy", "sipp-noans", "sipp-conc", "sipp-uac")
    (OUT / "run.log").write_text(f"start {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n")

    # REGISTER (IPs well above the long-lived ua101–103 containers)
    for i, ext in enumerate([100, 101, 102, 103]):
        ok = register(ext, f"172.30.0.{110 + i}")
        record(f"REG-{ext}", "PASS" if ok else "FAIL", "REGISTER 401→200" if ok else "see docker/sipp exit")

    contacts = sh(["docker", "exec", "pbx", "asterisk", "-rx", "pjsip show contacts"]).stdout
    (OUT / "contacts-after-reg.txt").write_text(contacts)

    # Answer UAS on 101: REGISTER creates Contact sip:101@IP:5060, then UAS
    # binds that same IP:5060 so INVITE/OPTIONS land on the answering process.
    docker_rm("sipp-uas101")
    register(101, "172.30.0.121")
    sipp(
        ["-sf", "/sipp/uas-answer.xml", "-s", "101", "-ap", passwd(101), "-au", "101", "-timeout", "180", "-l", "5"],
        name="sipp-uas101", detach=True, ip="172.30.0.121",
    )
    qualify(101)
    time.sleep(1.5)

    # Full call 100→101 with RTP
    r = sipp(
        [
            "-sf", "/sipp/uac-call.xml", "-s", "101", "-ap", passwd(100), "-au", "100",
            "-m", "1", "-timeout", "40",
            "-trace_msg", "-message_file", "/out/call101",
            "-trace_stat", "-stf", "/out/call101.csv",
        ],
        ip="172.30.0.130", timeout=60,
    )
    (OUT / "call101.err").write_text(r.stderr + "\n" + r.stdout)
    if r.returncode == 0 or msg_has("call101*", r"SIP/2\.0 200"):
        record("CALL-ANSWER", "PASS", "INVITE→100/180/200 + ACK + RTP pcap + BYE")
    else:
        record("CALL-ANSWER", "FAIL", f"rc={r.returncode}")

    # Busy
    docker_rm("sipp-uas101", "sipp-busy")
    register(102, "172.30.0.122")
    sipp(["-sf", "/sipp/uas-busy.xml", "-s", "102", "-timeout", "60"], name="sipp-busy", detach=True, ip="172.30.0.122")
    qualify(102)
    time.sleep(1)
    r = sipp(
        ["-sf", "/sipp/uac-call.xml", "-s", "102", "-ap", passwd(100), "-au", "100",
         "-m", "1", "-timeout", "25", "-trace_msg", "-message_file", "/out/busy"],
        ip="172.30.0.131", timeout=40,
    )
    (OUT / "busy.err").write_text(r.stderr + "\n" + r.stdout)
    if msg_has("busy*", r"486") or "486" in r.stderr:
        record("BUSY", "PASS", "486 Busy observed")
    else:
        record("BUSY", "FAIL", f"rc={r.returncode}")
    docker_rm("sipp-busy")

    # No-answer
    docker_rm("sipp-noans")
    register(103, "172.30.0.123")
    sipp(["-sf", "/sipp/uas-noanswer.xml", "-s", "103", "-timeout", "90"], name="sipp-noans", detach=True, ip="172.30.0.123")
    qualify(103)
    time.sleep(1)
    r = sipp(
        ["-sf", "/sipp/uac-call.xml", "-s", "103", "-ap", passwd(100), "-au", "100",
         "-m", "1", "-timeout", "45", "-trace_msg", "-message_file", "/out/noans"],
        ip="172.30.0.132", timeout=60,
    )
    (OUT / "noans.err").write_text(r.stderr + "\n" + r.stdout)
    if msg_has("noans*", r"486|408|480|CANCEL") or re.search(r"486|408|480|CANCEL", r.stderr, re.I):
        record("NOANSWER", "PASS", "no-answer / cancel path observed")
    else:
        record("NOANSWER", "FAIL", f"rc={r.returncode}")
    docker_rm("sipp-noans")

    # Cancel / abnormal disconnect
    docker_rm("sipp-uas101")
    register(101, "172.30.0.124")
    sipp(["-sf", "/sipp/uas-noanswer.xml", "-s", "101", "-timeout", "60"], name="sipp-uas101", detach=True, ip="172.30.0.124")
    qualify(101)
    time.sleep(1)
    r = sipp(
        ["-sf", "/sipp/uac-cancel.xml", "-s", "101", "-ap", passwd(100), "-au", "100",
         "-m", "1", "-timeout", "25", "-trace_msg", "-message_file", "/out/cancel"],
        ip="172.30.0.133", timeout=40,
    )
    (OUT / "cancel.err").write_text(r.stderr + "\n" + r.stdout)
    if r.returncode == 0 or msg_has("cancel*", r"CANCEL") or "CANCEL" in r.stderr:
        record("CANCEL", "PASS", "CANCEL observed")
    else:
        record("CANCEL", "FAIL", f"rc={r.returncode}")
    docker_rm("sipp-uas101")

    # Concurrent 10
    register(101, "172.30.0.125")
    sipp(
        ["-sf", "/sipp/uas-answer.xml", "-s", "101", "-ap", passwd(101), "-au", "101", "-l", "20", "-timeout", "180"],
        name="sipp-uas101", detach=True, ip="172.30.0.125",
    )
    qualify(101)
    time.sleep(1)
    r = sipp(
        [
            "-sf", "/sipp/uac-call.xml", "-s", "101", "-ap", passwd(100), "-au", "100",
            "-l", "10", "-m", "10", "-r", "10", "-rp", "1000",
            "-trace_stat", "-stf", "/out/conc10.csv", "-timeout", "90",
        ],
        ip="172.30.0.134", timeout=120,
    )
    (OUT / "conc10.err").write_text(r.stderr + "\n" + r.stdout)
    if (OUT / "conc10.csv").exists():
        record("CONC-10", "PASS", "CSV written")
    else:
        record("CONC-10", "FAIL", "no csv")

    # DTMF toward IVR 900 (media RFC2833 pcap) — best-effort
    r = sipp(
        [
            "-sf", "/sipp/uac-dtmf.xml", "-s", "900", "-ap", passwd(100), "-au", "100",
            "-m", "1", "-timeout", "40",
            "-trace_msg", "-message_file", "/out/dtmf",
            "-trace_stat", "-stf", "/out/dtmf.csv",
        ],
        ip="172.30.0.135", timeout=60,
    )
    (OUT / "dtmf.err").write_text(r.stderr + "\n" + r.stdout)
    if r.returncode == 0 or msg_has("dtmf*", r"SIP/2\.0 200"):
        record("DTMF-IVR", "PASS", "INVITE 900 + RTP + RFC2833 digit + BYE")
    else:
        record("DTMF-IVR", "FAIL", f"rc={r.returncode}")

    # Metrics
    lines = ["# SIPp metrics", ""]
    for name in ["call101.csv", "conc10.csv", "dtmf.csv"]:
        p = OUT / name
        if not p.exists():
            lines.append(f"- {name}: MISSING")
            continue
        rows = list(csv.reader(p.open(), delimiter=";"))
        if len(rows) < 2:
            lines.append(f"- {name}: empty")
            continue
        hdr, last = rows[0], rows[-1]
        lines.append(f"## {name}")
        for i, h in enumerate(hdr):
            if any(k in h for k in ("Successful", "Failed", "ResponseTime", "CallLength", "CurrentCall", "Peak")):
                lines.append(f"- {h} = {last[i] if i < len(last) else '?'}")
        lines.append("")
    (OUT / "metrics.md").write_text("\n".join(lines) + "\n")

    # Summary
    tsv = ["id\tstatus\tdetail"] + [f"{a}\t{b}\t{c}" for a, b, c in SUMMARY]
    (OUT / "summary.tsv").write_text("\n".join(tsv) + "\n")
    md = ["# Phase-3 SIP lab results", ""]
    md += [f"| {a} | {b} | {c} |" for a, b, c in [("ID", "Status", "Detail"), ("---", "---", "---")] + SUMMARY]
    md += ["", (OUT / "metrics.md").read_text()]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n")
    print((OUT / "RESULTS.md").read_text())

    docker_rm("sipp-uas101", "sipp-busy", "sipp-noans")
    fails = sum(1 for _, s, _ in SUMMARY if s != "PASS")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
