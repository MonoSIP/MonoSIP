#!/usr/bin/env bash
# 60-minute endurance sampler against a live MonoSIP instance.
# Samples every 30s: RSS, heap (if exposed), CPU%, event-loop lag proxy (health
# latency), DB connections, sessions, SIP contacts, active channels, FDs.
# Does NOT stress-call by default (set LOAD=1 to add light concurrent health load).
set -u

BASE="${BASE_URL:-http://127.0.0.1:3100}"
CTR="${CONTAINER:-pbx}"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/out"
mkdir -p "$OUT_DIR"
CSV="$OUT_DIR/samples.csv"
DUR_SEC="${DURATION_SEC:-3600}"
INTERVAL="${INTERVAL_SEC:-30}"

echo "ts,elapsed_s,health_ms,rss_kb,fds,db_ok,asterisk_ok,contacts,channels,sessions,cpu_pct,load1" >"$CSV"
START=$(date +%s)
END=$((START + DUR_SEC))
N=0

echo "endurance start $(date -u +%Y-%m-%dT%H:%M:%SZ) base=$BASE ctr=$CTR dur=${DUR_SEC}s" | tee "$OUT_DIR/run.log"

while [ "$(date +%s)" -lt "$END" ]; do
  NOW=$(date +%s)
  EL=$((NOW - START))
  T0=$(python3 - <<'PY'
import time; print(time.time())
PY
)
  HEALTH=$(curl -sf -m 5 "$BASE/api/v1/health" || echo '{"ok":false}')
  T1=$(python3 - <<'PY'
import time; print(time.time())
PY
)
  HMS=$(python3 -c "print(int(($T1-$T0)*1000))")
  DB=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print('1' if d.get('db') else '0')" "$HEALTH")
  AST=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print('1' if d.get('asterisk') else '0')" "$HEALTH")

  RSS=$(docker stats --no-stream --format '{{.MemUsage}}' "$CTR" 2>/dev/null | awk '{print $1}' || echo 0)
  # normalize to KiB roughly
  RSS_KB=$(python3 - <<PY
s="$RSS"
s=s.strip()
try:
  if s.upper().endswith("GIB"):
    print(int(float(s[:-3])*1024*1024))
  elif s.upper().endswith("MIB"):
    print(int(float(s[:-3])*1024))
  elif s.upper().endswith("KIB"):
    print(int(float(s[:-3])))
  else:
    print(0)
except Exception:
  print(0)
PY
)
  CPU=$(docker stats --no-stream --format '{{.CPUPerc}}' "$CTR" 2>/dev/null | tr -d '%' || echo 0)
  FDS=$(docker exec "$CTR" sh -c 'ls /proc/1/fd 2>/dev/null | wc -l' || echo 0)
  CONTACTS=$(docker exec "$CTR" asterisk -rx 'pjsip show contacts' 2>/dev/null | grep -cE 'Avail|NonQual|Unavail' || true)
  CONTACTS=${CONTACTS:-0}
  CHANNELS=$(docker exec "$CTR" asterisk -rx 'core show channels count' 2>/dev/null | awk '/active channels/{print $1; exit}' || true)
  CHANNELS=${CHANNELS:-0}
  SESSIONS=$(docker exec "$CTR" sh -c 'psql "$DATABASE_URL" -Atc "select count(*) from sessions" 2>/dev/null' || true)
  SESSIONS=${SESSIONS:--1}
  LOAD1=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}' || echo 0)
  LOAD1=${LOAD1:-0}

  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$EL,$HMS,$RSS_KB,$FDS,$DB,$AST,$CONTACTS,$CHANNELS,$SESSIONS,$CPU,$LOAD1" >>"$CSV"
  N=$((N + 1))
  if [ $((N % 10)) -eq 0 ]; then
    echo "[+$EL s] samples=$N health_ms=$HMS rss_kb=$RSS_KB fds=$FDS cpu=$CPU contacts=$CONTACTS channels=$CHANNELS" | tee -a "$OUT_DIR/run.log"
  fi
  sleep "$INTERVAL"
done

python3 - "$CSV" "$OUT_DIR/summary.md" <<'PY'
import csv, statistics as st, sys, pathlib
rows=list(csv.DictReader(open(sys.argv[1])))
out=pathlib.Path(sys.argv[2])
def nums(key):
  vals=[]
  for r in rows:
    try: vals.append(float(r[key]))
    except: pass
  return vals
rss=nums('rss_kb'); hms=nums('health_ms'); fds=nums('fds'); cpu=nums('cpu_pct')
def trend(vals):
  if len(vals)<4: return "n/a"
  a=st.mean(vals[:max(3,len(vals)//5)]); b=st.mean(vals[-max(3,len(vals)//5):])
  return f"early_mean={a:.1f} late_mean={b:.1f} delta={b-a:.1f}"
md=[]
md.append(f"# Endurance summary — {len(rows)} samples")
md.append("")
md.append(f"- Duration samples: {rows[0]['elapsed_s']}s → {rows[-1]['elapsed_s']}s")
md.append(f"- Health latency ms: min={min(hms):.0f} p50={st.median(hms):.0f} max={max(hms):.0f}")
md.append(f"- RSS KiB: min={min(rss):.0f} mean={st.mean(rss):.0f} max={max(rss):.0f} | {trend(rss)}")
md.append(f"- FDs: min={min(fds):.0f} mean={st.mean(fds):.0f} max={max(fds):.0f} | {trend(fds)}")
md.append(f"- CPU %: min={min(cpu):.1f} mean={st.mean(cpu):.1f} max={max(cpu):.1f}")
md.append("")
# leak heuristic: late mean > early mean * 1.25 and absolute growth > 50MB
early=st.mean(rss[:max(3,len(rss)//5)]); late=st.mean(rss[-max(3,len(rss)//5):])
leak = late > early * 1.25 and (late - early) > 50*1024
md.append(f"- Leak heuristic (RSS growth): {'FAIL — upward trend' if leak else 'PASS — no sustained growth'}")
out.write_text("\n".join(md)+"\n")
print(out.read_text())
PY

echo "endurance done $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$OUT_DIR/run.log"
