#!/usr/bin/env bash
# bp: Bursar seat tools for Creao agents.
# Needs BP_GATEWAY_URL (a Creao Secret) and BP_TICKET (export it from payload.ticket).
# Every call is checked by the gateway: your seat may use only its own tools and sign only its own stamps.
set -euo pipefail

usage() {
  cat <<'EOF'
bp inbox                                 files that arrived for this bill (Intake only)
bp fetch <name> [out]                    download one inbox file, raw, to out (default /tmp/<name>)
bp record-bill <bill.json>               record the fields you read from the email and PDF (Intake only)
bp bill                                  the bill fields Intake recorded (other seats)
bp vendor-search <name>                  vendor master records matching a name
bp vendor <vendorId>                     one vendor master record (verified contacts, bank, change history)
bp payments <vendorId>                   bank payment history for a vendor (amounts in cents, where money went)
bp po <poNumber>                         a purchase order
bp receiving <poNumber>                  receiving log entries for a PO
bp contract <vendorId>                   the vendor's contract (terms, rate tolerance)
bp employee-match [--phone P] [--address A] [--name N]
                                         employees that match, and on what (never the full list)
bp crs-verify <persona> <bank_change|new_vendor>
                                         CRS chain: Fraud Finder, identity, reverse phone (Vendor-Records only)
bp submit <stamps.json>                  submit {"stamps":[...]} for the gateway to check and sign
bp rules                                 your seat's rule book: fixed rules and rules learned from AP decisions
EOF
}

# Printed after the usage text, so every agent sees its rules during setup (it runs bp help first).
rules() {
  echo "RULES FOR YOUR SEAT. Read them before you decide. Follow them when they apply, and when a rule decides a stamp, name its ID in the reason."
  echo
  call "$GW/tools/rulebook"
}

: "${BP_GATEWAY_URL:?BP_GATEWAY_URL is not set (it is a Creao Secret)}"
GW="${BP_GATEWAY_URL%/}"

call() {
  : "${BP_TICKET:?BP_TICKET is not set: run export BP_TICKET=<payload.ticket> first}"
  curl -sS --max-time 60 --fail-with-body \
    -H "Authorization: Bearer $BP_TICKET" -H "Content-Type: application/json" "$@"
  echo
}

cmd="${1:-help}"
shift || true
case "$cmd" in
  inbox) call "$GW/tools/inbox" ;;
  fetch)
    : "${BP_TICKET:?BP_TICKET is not set: run export BP_TICKET=<payload.ticket> first}"
    out="${2:-/tmp/${1:?name}}"
    curl -sS --max-time 60 --fail-with-body -H "Authorization: Bearer $BP_TICKET" "$GW/tools/inbox/${1:?name}" -o "$out"
    echo "saved $out ($(wc -c <"$out") bytes)"
    ;;
  record-bill) call -X POST "$GW/tools/bill" --data-binary "@${1:?bill.json}" ;;
  bill) call "$GW/tools/bill" ;;
  vendor-search) call -G "$GW/tools/vendors" --data-urlencode "name=${1:?name}" ;;
  vendor) call "$GW/tools/vendors/${1:?vendorId}" ;;
  payments) call -G "$GW/tools/payments" --data-urlencode "vendorId=${1:?vendorId}" ;;
  po) call "$GW/tools/po/${1:?poNumber}" ;;
  receiving) call -G "$GW/tools/receiving" --data-urlencode "po=${1:?poNumber}" ;;
  contract) call "$GW/tools/contracts/${1:?vendorId}" ;;
  employee-match)
    args=()
    while [ $# -gt 0 ]; do
      case "$1" in
        --phone) args+=(--data-urlencode "phone=$2"); shift 2 ;;
        --address) args+=(--data-urlencode "address=$2"); shift 2 ;;
        --name) args+=(--data-urlencode "name=$2"); shift 2 ;;
        *) echo "unknown option $1" >&2; exit 2 ;;
      esac
    done
    call -G "$GW/tools/employees/match" "${args[@]}"
    ;;
  crs-verify)
    call -X POST "$GW/crs/verify-requester" \
      -d "{\"persona\":\"${1:?persona}\",\"purpose\":\"${2:?purpose}\"}"
    ;;
  submit) call -X POST "$GW/tools/stamps" --data-binary "@${1:?stamps.json}" ;;
  rules) rules ;;
  help | -h | --help)
    usage
    if [ -n "${BP_TICKET:-}" ]; then
      echo
      rules || echo "(could not load your rule book; run bp rules)"
    fi
    ;;
  *) echo "unknown command: $cmd" >&2; usage >&2; exit 2 ;;
esac
