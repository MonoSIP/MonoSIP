#!/bin/sh
# Generated Asterisk configs and the TTS / prompt sounds folder from before the
# MunaSIP rename move once — before Asterisk starts (all-in-one) and before the
# DB migration points stored paths at sounds/munasip. Runs in the API container
# in both the single image and Compose (shared Asterisk config volume).
# Must be sourced after bootstrap-runtime.sh.
AST_CFG="${ASTERISK_CONFIG_DIR:-${MUNASIP_DATA_DIR:-/data}/asterisk}"

# The files also carry the old identifiers (ACL name, contexts, Stasis apps,
# channel variables). They are generated, so renaming inside is safe; Asterisk
# must load them consistent, because the ACL is never reloaded by the fallback
# reload path — a PJSIP endpoint naming an unknown ACL rejects every REGISTER.
for f in pjsip acl queues extensions musiconhold; do
  if [ -f "$AST_CFG/${f}_dsip.conf" ] && [ ! -s "$AST_CFG/${f}_munasip.conf" ]; then
    # Only the generated identifiers: a hostname such as dsip.example.com in
    # from_domain must stay as it is.
    sed -e 's/dsip_sip_acl/munasip_sip_acl/g' \
        -e 's/dsip-\([a-z]\)/munasip-\1/g' \
        -e 's/DSIP_/MUNASIP_/g' \
        -e 's#/var/lib/asterisk/dsip#/var/lib/asterisk/munasip#g' \
        -e 's#\([(,:]\)dsip/#\1munasip/#g' \
        -e 's/_dsip\.conf/_munasip.conf/g' \
        "$AST_CFG/${f}_dsip.conf" > "$AST_CFG/${f}_munasip.conf" \
      && rm -f "$AST_CFG/${f}_dsip.conf"
  fi
done
if [ -d "$AST_CFG/sounds/dsip" ] && [ ! -L "$AST_CFG/sounds/dsip" ]; then
  mkdir -p "$AST_CFG/sounds/munasip"
  for x in "$AST_CFG"/sounds/dsip/* "$AST_CFG"/sounds/dsip/.[!.]*; do
    [ -e "$x" ] || continue
    [ -e "$AST_CFG/sounds/munasip/$(basename "$x")" ] || mv "$x" "$AST_CFG/sounds/munasip/"
  done
  rm -rf "$AST_CFG/sounds/dsip"
  echo "Moved $AST_CFG/sounds/dsip → sounds/munasip"
fi
