#!/bin/sh
# Generated Asterisk configs and the TTS / prompt sounds folder from before the
# MonoSIP rename move once — before Asterisk starts (all-in-one) and before the
# DB migration points stored paths at sounds/monosip. Runs in the API container
# in both the single image and Compose (shared Asterisk config volume).
# Must be sourced after bootstrap-runtime.sh.
AST_CFG="${ASTERISK_CONFIG_DIR:-${MONOSIP_DATA_DIR:-/data}/asterisk}"

# The files also carry the old identifiers (ACL name, contexts, Stasis apps,
# channel variables). They are generated, so renaming inside is safe; Asterisk
# must load them consistent, because the ACL is never reloaded by the fallback
# reload path — a PJSIP endpoint naming an unknown ACL rejects every REGISTER.
for f in pjsip acl queues extensions musiconhold; do
  if [ -f "$AST_CFG/${f}_dsip.conf" ] && [ ! -s "$AST_CFG/${f}_monosip.conf" ]; then
    # Only the generated identifiers: a hostname such as dsip.example.com in
    # from_domain must stay as it is.
    sed -e 's/dsip_sip_acl/monosip_sip_acl/g' \
        -e 's/dsip-\([a-z]\)/monosip-\1/g' \
        -e 's/DSIP_/MONOSIP_/g' \
        -e 's#/var/lib/asterisk/dsip#/var/lib/asterisk/monosip#g' \
        -e 's#\([(,:]\)dsip/#\1monosip/#g' \
        -e 's/_dsip\.conf/_monosip.conf/g' \
        "$AST_CFG/${f}_dsip.conf" > "$AST_CFG/${f}_monosip.conf" \
      && rm -f "$AST_CFG/${f}_dsip.conf"
  fi
done
if [ -d "$AST_CFG/sounds/dsip" ] && [ ! -L "$AST_CFG/sounds/dsip" ]; then
  mkdir -p "$AST_CFG/sounds/monosip"
  for x in "$AST_CFG"/sounds/dsip/* "$AST_CFG"/sounds/dsip/.[!.]*; do
    [ -e "$x" ] || continue
    [ -e "$AST_CFG/sounds/monosip/$(basename "$x")" ] || mv "$x" "$AST_CFG/sounds/monosip/"
  done
  rm -rf "$AST_CFG/sounds/dsip"
  echo "Moved $AST_CFG/sounds/dsip → sounds/monosip"
fi
